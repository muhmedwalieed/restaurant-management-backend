import orderRepository from "./order.repository.js";
import branchRepository from "../branches/branch.repository.js";
import tableRepository from "../tables/table.repository.js";
import couponService from "../coupons/coupon.service.js";
import { emitEvent, DomainEvent } from "../../shared/events/event-bus.js";
import prisma from "../../lib/prisma.js";
import { BusinessRuleError, NotFoundError, AuthorizationError } from "../../shared/errors/index.js";
import { getEmployeePermissions } from "../auth/authorize.middleware.js";

function validateStateTransition(currentStatus, newStatus, orderType) {
  if (currentStatus === newStatus) {
    return;
  }

  if (currentStatus === "DELIVERED" || currentStatus === "CANCELLED") {
    throw new BusinessRuleError(`Order is in terminal state '${currentStatus}' and cannot be updated`);
  }

  const validMap = {
    PENDING: ["CONFIRMED"],
    CONFIRMED: ["PREPARING"],
    PREPARING: ["READY"],
    READY: orderType === "DELIVERY" ? ["OUT_FOR_DELIVERY"] : ["DELIVERED"],
    OUT_FOR_DELIVERY: ["DELIVERED"],
  };

  const allowedNextStates = validMap[currentStatus] || [];
  if (!allowedNextStates.includes(newStatus)) {
    throw new BusinessRuleError(
      `Invalid order state transition from '${currentStatus}' to '${newStatus}' for order type '${orderType}'`
    );
  }
}

export class OrderService {
  async verifyBranchOwnership(tenantContext, branchId) {
    const branch = await branchRepository.findBranchById(tenantContext, branchId);
    if (!branch) {
      throw new NotFoundError("Branch not found or access denied");
    }
    return branch;
  }

  async listOrders(tenantContext, branchId, { page = 1, limit = 20, status, type, source, tableId } = {}) {
    await this.verifyBranchOwnership(tenantContext, branchId);
    const { items, total } = await orderRepository.findOrdersByBranch(tenantContext, branchId, {
      page,
      limit,
      status,
      type,
      source,
      tableId,
    });

    const totalPages = Math.ceil(total / limit) || 1;
    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  async listAllOrders(tenantContext, { page = 1, limit = 20, status, type, source, branchId, tableId } = {}) {
    const { items, total } = await orderRepository.findOrdersByTenant(tenantContext, {
      page,
      limit,
      status,
      type,
      source,
      branchId,
      tableId,
    });

    const totalPages = Math.ceil(total / limit) || 1;
    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  async getOrderById(tenantContext, branchId, orderId) {
    await this.verifyBranchOwnership(tenantContext, branchId);

    const order = await orderRepository.findOrderById(tenantContext, branchId, orderId);
    if (!order) {
      throw new NotFoundError("Order not found or access denied");
    }

    return order;
  }

  async createOrder(tenantContext, branchId, payload, idempotencyKey = null) {
    const restaurantId = tenantContext.restaurantId;

    if (idempotencyKey) {
      const cached = await orderRepository.findIdempotencyKey(restaurantId, idempotencyKey);
      if (cached) {
        return {
          isCached: true,
          statusCode: cached.statusCode,
          data: cached.responseBody,
        };
      }
    }

    await this.verifyBranchOwnership(tenantContext, branchId);

    if (!payload.customerId && payload.customerPhone) {
      const customerService = (await import("../customers/customer.service.js")).default;
      const customer = await customerService.findOrCreateCustomerByPhone(tenantContext, {
        phone: payload.customerPhone,
        name: payload.customerName,
      });
      if (customer) {
        payload.customerId = customer.id;
      }
    } else if (payload.customerId) {
      const customer = await prisma.customer.findFirst({
        where: {
          id: payload.customerId,
          restaurantId,
          deletedAt: null,
        },
      });
      if (!customer) {
        throw new NotFoundError("Customer not found or access denied");
      }
    }

    if (payload.tableId) {
      const table = await tableRepository.findTableById(tenantContext, branchId, payload.tableId);
      if (!table) {
        throw new NotFoundError("Table not found in target branch");
      }

      if (payload.source !== "QR") {
        const activeOrderOnTable = await prisma.order.findFirst({
          where: {
            restaurantId,
            branchId,
            tableId: payload.tableId,
            status: { in: ["PENDING", "CONFIRMED", "PREPARING", "READY"] },
          },
          select: { id: true, orderNumber: true },
        });
        if (activeOrderOnTable) {
          throw new BusinessRuleError(
            `Table already has an active order (#${activeOrderOnTable.orderNumber}). A table can only have one active order at a time`
          );
        }
      }
    }

    let calculatedSubtotal = 0;
    const itemSnapshots = [];

    for (const itemInput of payload.items) {
      const product = await prisma.product.findFirst({
        where: {
          id: itemInput.productId,
          restaurantId,
          isAvailable: true,
          status: "ACTIVE",
          deletedAt: null,
        },
      });

      if (!product) {
        throw new NotFoundError(`Product '${itemInput.productId}' not found or unavailable`);
      }

      const unitPrice = Number(product.price);
      let modifiersTotal = 0;
      const selectedModifiersList = [];

      const modifierSelection =
        Array.isArray(itemInput.modifiers) && itemInput.modifiers.length > 0
          ? itemInput.modifiers
          : (itemInput.modifierIds || []).map((id) => ({ modifierId: id, quantity: 1 }));

      if (modifierSelection.length > 0) {
        const modifierIds = modifierSelection.map((m) => m.modifierId);
        const modifiers = await prisma.productModifier.findMany({
          where: {
            id: { in: modifierIds },
            productId: product.id,
            restaurantId,
            deletedAt: null,
          },
        });

        for (const mod of modifiers) {
          const selection = modifierSelection.find((s) => s.modifierId === mod.id);
          const quantity = Math.min(
            Math.max(1, Number(selection?.quantity) || 1),
            mod.quantityMode === "QUANTITY" ? mod.maxQuantity : 1
          );
          const delta = Number(mod.priceDelta) * quantity;
          modifiersTotal += delta;
          selectedModifiersList.push({
            id: mod.id,
            name: mod.name,
            priceDelta: Number(mod.priceDelta),
            quantity,
          });
        }
      }

      const itemUnitPrice = unitPrice + modifiersTotal;
      const itemSubtotal = itemUnitPrice * itemInput.quantity;
      calculatedSubtotal += itemSubtotal;

      itemSnapshots.push({
        productId: product.id,
        productName: product.name,
        quantity: itemInput.quantity,
        unitPrice: itemUnitPrice,
        subtotal: itemSubtotal,
        notes: itemInput.notes || null,
        selectedModifiers: selectedModifiersList.length > 0 ? selectedModifiersList : null,
        round: itemInput.round || 1,
      });
    }

    const hasCoupon = Boolean(payload.couponId);
    const discountAmount = hasCoupon ? 0 : payload.discountAmount ? Number(payload.discountAmount) : 0;
    if (discountAmount > 0) {
      if (!tenantContext?.employeeId) {
        throw new AuthorizationError("Manual discounts require an authenticated employee");
      }
      const { isSystem, roleName, permissions } = await getEmployeePermissions(
        tenantContext.employeeId,
        tenantContext.restaurantId
      );
      const allowed = isSystem && roleName === "owner" ? true : permissions.includes("orders.discount");
      if (!allowed) {
        throw new AuthorizationError("You don't have permission to apply manual discounts");
      }
    }

    const orderPayload = {
      source: payload.source || "CASHIER",
      type: payload.type || "DINE_IN",
      tableId: payload.tableId || null,
      customerId: payload.customerId || null,
      couponId: payload.couponId || null,
      subtotal: calculatedSubtotal,
      discountAmount,
      notes: payload.notes || null,
      address: payload.address || null,
      paymentStatus: payload.paymentStatus || "PENDING",
      paymentMethod: payload.paymentMethod || null,
    };

    const order = await orderRepository.createOrderTransaction(
      tenantContext,
      branchId,
      orderPayload,
      itemSnapshots,
      idempotencyKey
    );

    emitEvent(DomainEvent.ORDER_CREATED, {
      restaurantId,
      branchId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      total: Number(order.total),
      source: order.source,
      type: order.type,
      tableId: order.tableId || null,
      actorEmployeeId: tenantContext.employeeId || null,
    });

    return {
      isCached: false,
      statusCode: 201,
      data: order,
    };
  }

  async updateOrderStatus(tenantContext, branchId, orderId, { newStatus, expectedVersion, reason }) {
    if (newStatus === "CANCELLED") {
      throw new BusinessRuleError("Cancellation is not allowed via status update endpoint. Use the /orders/:id/cancel endpoint");
    }

    const order = await this.getOrderById(tenantContext, branchId, orderId);

    validateStateTransition(order.status, newStatus, order.type);

    await orderRepository.updateOrderStatusWithHistoryTransaction(
      tenantContext,
      branchId,
      orderId,
      expectedVersion,
      order.status,
      newStatus,
      tenantContext.employeeId || null,
      reason
    );

    emitEvent(DomainEvent.ORDER_STATUS_CHANGED, {
      restaurantId: tenantContext.restaurantId,
      branchId,
      orderId,
      orderNumber: order.orderNumber,
      status: newStatus,
      previousStatus: order.status,
      tableId: order.tableId || null,
      actorEmployeeId: tenantContext.employeeId || null,
    });

    return this.getOrderById(tenantContext, branchId, orderId);
  }

  async cancelOrder(tenantContext, branchId, orderId, { expectedVersion, reason }) {
    if (!reason || reason.trim().length === 0) {
      throw new BusinessRuleError("Cancellation reason is required");
    }

    const order = await this.getOrderById(tenantContext, branchId, orderId);

    if (order.status === "DELIVERED" || order.status === "CANCELLED") {
      throw new BusinessRuleError(`Order is in terminal state '${order.status}' and cannot be cancelled`);
    }

    await orderRepository.updateOrderStatusWithHistoryTransaction(
      tenantContext,
      branchId,
      orderId,
      expectedVersion,
      order.status,
      "CANCELLED",
      tenantContext.employeeId || null,
      reason
    );

    emitEvent(DomainEvent.ORDER_STATUS_CHANGED, {
      restaurantId: tenantContext.restaurantId,
      branchId,
      orderId,
      orderNumber: order.orderNumber,
      status: "CANCELLED",
      previousStatus: order.status,
      tableId: order.tableId || null,
      actorEmployeeId: tenantContext.employeeId || null,
    });

    return this.getOrderById(tenantContext, branchId, orderId);
  }

  async getOrderHistory(tenantContext, branchId, orderId) {
    await this.verifyBranchOwnership(tenantContext, branchId);
    return orderRepository.findOrderHistory(tenantContext, branchId, orderId);
  }

  async createPublicOrder(payload, idempotencyKey = null) {
    let branchId = payload.branchId;
    let tableId = payload.tableId;
    let restaurantId = payload.restaurantId;

    if (payload.tableToken) {
      const table = await tableRepository.findTableByQrToken(payload.tableToken);
      if (!table || !table.branch || table.branch.status !== "ACTIVE") {
        throw new NotFoundError("Invalid or expired QR code");
      }
      branchId = table.branchId;
      tableId = table.id;
      restaurantId = table.restaurantId;
    }

    if (!restaurantId) {
      throw new NotFoundError("Target restaurant not found");
    }

    if (!branchId) {
      const tenantContext = { restaurantId };
      const mainBranch = await branchRepository.findMainBranch(tenantContext);
      if (!mainBranch) {
        throw new NotFoundError("No active branch found for this restaurant");
      }
      branchId = mainBranch.id;
    }

    const tenantContext = { restaurantId };

    if (payload.couponCode) {
      const couponId = await couponService.getCouponIdByCode(tenantContext, payload.couponCode);
      if (!couponId) {
        throw new BusinessRuleError("Invalid or unavailable coupon code");
      }
      payload = { ...payload, couponId, couponCode: undefined };
    }

    return this.createOrder(
      tenantContext,
      branchId,
      {
        ...payload,
        branchId,
        tableId,
        address: payload.address || null,
        notes: payload.notes || null,
        source: payload.tableToken ? "QR" : "WEBSITE",
        type: payload.tableToken ? "DINE_IN" : payload.type || "PICKUP",
      },
      idempotencyKey
    );
  }

  async trackOrder({ slug, orderNumber, phone }) {
    const restaurant = await prisma.restaurant.findFirst({
      where: { slug, status: "ACTIVE" },
      select: { id: true },
    });
    if (!restaurant) {
      throw new NotFoundError("Restaurant not found");
    }

    const order = await prisma.order.findFirst({
      where: {
        restaurantId: restaurant.id,
        orderNumber,
        customer: { phone },
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        type: true,
        total: true,
        createdAt: true,
        items: { select: { id: true, productName: true, quantity: true, subtotal: true } },
      },
    });
    if (!order) {
      throw new NotFoundError("Order not found for this number and phone");
    }

    return order;
  }

  async createPosOrder(tenantContext, branchId, payload, idempotencyKey = null) {
    const type = payload.type || "DINE_IN";

    if (type === "DINE_IN" && !payload.tableId) {
      throw new BusinessRuleError("tableId is required for DINE_IN POS orders");
    }

    if (type === "DELIVERY" && !payload.customerName?.trim()) {
      throw new BusinessRuleError("Customer name is required for DELIVERY orders");
    }

    if (type === "DELIVERY" && !payload.address?.trim()) {
      throw new BusinessRuleError("Delivery address is required for DELIVERY orders");
    }

    if ((type === "DELIVERY" || type === "PICKUP") && !payload.customerId && !payload.customerPhone) {
      throw new BusinessRuleError("Customer profile or customer phone number is required for DELIVERY and PICKUP orders");
    }

    return this.createOrder(
      tenantContext,
      branchId,
      {
        ...payload,
        source: payload.source || "CASHIER",
        type,
      },
      idempotencyKey
    );
  }

  async processOrderPayment(tenantContext, branchId, orderId, payload) {
    const order = await this.getOrderById(tenantContext, branchId, orderId);

    if (order.status === "CANCELLED") {
      throw new BusinessRuleError("Cannot process payment for cancelled order");
    }

    if (order.paymentStatus === "PAID") {
      throw new BusinessRuleError("Order is already paid");
    }

    if (order.paymentStatus === "REFUNDED") {
      throw new BusinessRuleError("Cannot process payment for refunded order");
    }

    if (payload.amount !== undefined && Number(payload.amount) > Number(order.total)) {
      throw new BusinessRuleError("Payment amount exceeds order total");
    }

    await orderRepository.updateOrderPaymentWithHistoryTransaction(
      tenantContext,
      branchId,
      orderId,
      payload.expectedVersion,
      payload
    );

    emitEvent(DomainEvent.ORDER_PAID, {
      restaurantId: tenantContext.restaurantId,
      branchId,
      orderId,
      orderNumber: order.orderNumber,
      total: Number(order.total),
      tableId: order.tableId || null,
      actorEmployeeId: tenantContext.employeeId || null,
    });

    return this.getOrderById(tenantContext, branchId, orderId);
  }

  async processOrderRefund(tenantContext, branchId, orderId, payload) {
    const order = await this.getOrderById(tenantContext, branchId, orderId);

    if (order.paymentStatus !== "PAID") {
      throw new BusinessRuleError("Only paid orders can be refunded");
    }

    await orderRepository.updateOrderRefundWithHistoryTransaction(
      tenantContext,
      branchId,
      orderId,
      payload.expectedVersion,
      payload
    );

    return this.getOrderById(tenantContext, branchId, orderId);
  }
}

export const orderService = new OrderService();
export default orderService;
