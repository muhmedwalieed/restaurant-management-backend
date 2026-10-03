import deliveryRepository from "./delivery.repository.js";
import { NotFoundError, BusinessRuleError, ConflictError } from "../../shared/errors/index.js";
import { assertBranchInTenant } from "../../shared/utils/assert-branch.js";
import { emitEvent, DomainEvent } from "../../shared/events/event-bus.js";
import prisma from "../../lib/prisma.js";

export class DeliveryService {
  async verifyBranchOwnership(tenantContext, branchId) {
    return assertBranchInTenant(tenantContext, branchId);
  }

  /**
   * Get delivery orders for driver / branch.
   */
  async getDeliveryOrders(tenantContext, branchId, { status } = {}) {
    await this.verifyBranchOwnership(tenantContext, branchId);
    const orders = await deliveryRepository.findDeliveryOrders(tenantContext, branchId, { status });

    return orders.map((o) => {
      const isCod = o.paymentStatus === "PENDING" || o.paymentMethod === "CASH";
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        orderDate: o.orderDate,
        type: o.type,
        source: o.source,
        status: o.status,
        paymentStatus: o.paymentStatus,
        paymentMethod: o.paymentMethod,
        isCod,
        subtotal: Number(o.subtotal),
        discountAmount: Number(o.discountAmount || 0),
        total: Number(o.total),
        notes: o.notes,
        address: o.address,
        cancelReason: o.cancelReason,
        version: o.version,
        createdAt: o.createdAt,
        customer: o.customer
          ? {
              id: o.customer.id,
              name: o.customer.name,
              phone: o.customer.phone,
            }
          : null,
        items: o.items.map((it) => ({
          id: it.id,
          productId: it.productId,
          productName: it.productName,
          quantity: it.quantity,
          unitPrice: Number(it.unitPrice),
          subtotal: Number(it.subtotal),
          notes: it.notes,
        })),
      };
    });
  }

  /**
   * Driver marks order as Picked Up / Out for Delivery.
   */
  async pickupOrder(tenantContext, branchId, orderId, { expectedVersion } = {}) {
    await this.verifyBranchOwnership(tenantContext, branchId);
    const order = await deliveryRepository.findOrderById(tenantContext, branchId, orderId);
    if (!order) throw new NotFoundError("Order not found");

    if (order.type !== "DELIVERY") {
      throw new BusinessRuleError("Only delivery orders can be picked up by delivery drivers");
    }

    if (order.status === "DELIVERED" || order.status === "CANCELLED") {
      throw new BusinessRuleError(`Order is already ${order.status}`);
    }

    const fromStatus = order.status;
    const toStatus = "OUT_FOR_DELIVERY";

    const updated = await deliveryRepository.updateDeliveryStatus(tenantContext, orderId, {
      status: toStatus,
      expectedVersion,
    });

    if (updated.count === 0) {
      throw new ConflictError("Order was updated by another request. Please refresh and try again.");
    }

    await prisma.orderStatusHistory.create({
      data: {
        restaurantId: tenantContext.restaurantId,
        orderId,
        fromStatus,
        toStatus,
        changedById: tenantContext.employeeId || null,
        reason: "Picked up from restaurant by delivery driver",
      },
    });

    emitEvent(DomainEvent.ORDER_STATUS_CHANGED, {
      restaurantId: tenantContext.restaurantId,
      branchId,
      orderId,
      fromStatus,
      toStatus,
      orderNumber: order.orderNumber,
      actorEmployeeId: tenantContext.employeeId || null,
    });

    return {
      orderId,
      orderNumber: order.orderNumber,
      status: toStatus,
      message: `تم استلام الطلب #${order.orderNumber} وبدء التوصيل`,
    };
  }

  /**
   * Driver marks order as Delivered and settles COD if cash.
   */
  async deliverOrder(tenantContext, branchId, orderId, { expectedVersion, paymentMethod = "CASH" } = {}) {
    await this.verifyBranchOwnership(tenantContext, branchId);
    const order = await deliveryRepository.findOrderById(tenantContext, branchId, orderId);
    if (!order) throw new NotFoundError("Order not found");

    if (order.type !== "DELIVERY") {
      throw new BusinessRuleError("Only delivery orders can be delivered");
    }

    if (order.status === "DELIVERED") {
      throw new BusinessRuleError("Order is already delivered");
    }

    const fromStatus = order.status;
    const toStatus = "DELIVERED";
    const isCod = order.paymentStatus === "PENDING";
    const now = new Date();

    const updatePayload = {
      status: toStatus,
      expectedVersion,
    };

    if (isCod) {
      updatePayload.paymentStatus = "PAID";
      updatePayload.paymentMethod = paymentMethod || "CASH";
      updatePayload.amountPaid = Number(order.total);
    }

    const updated = await deliveryRepository.updateDeliveryStatus(tenantContext, orderId, updatePayload);
    if (updated.count === 0) {
      throw new ConflictError("Order was updated by another request. Please refresh and try again.");
    }

    if (isCod) {
      try {
        await prisma.orderPayment.create({
          data: {
            restaurantId: tenantContext.restaurantId,
            orderId,
            type: "PAYMENT",
            amount: Number(order.total),
            paymentMethod: paymentMethod || "CASH",
            status: "PAID",
            employeeId: tenantContext.employeeId || null,
          },
        });
      } catch (_) {}

      emitEvent(DomainEvent.ORDER_PAID, {
        restaurantId: tenantContext.restaurantId,
        branchId,
        orderId,
        orderNumber: order.orderNumber,
        total: Number(order.total),
        paymentMethod: paymentMethod || "CASH",
        actorEmployeeId: tenantContext.employeeId || null,
      });
    }

    await prisma.orderStatusHistory.create({
      data: {
        restaurantId: tenantContext.restaurantId,
        orderId,
        fromStatus,
        toStatus,
        changedById: tenantContext.employeeId || null,
        reason: isCod
          ? `Delivered to customer - COD cash (${order.total}) collected by driver`
          : "Delivered to customer (Prepaid online)",
      },
    });

    emitEvent(DomainEvent.ORDER_STATUS_CHANGED, {
      restaurantId: tenantContext.restaurantId,
      branchId,
      orderId,
      fromStatus,
      toStatus,
      orderNumber: order.orderNumber,
      actorEmployeeId: tenantContext.employeeId || null,
    });

    return {
      orderId,
      orderNumber: order.orderNumber,
      status: toStatus,
      isCod,
      collectedAmount: isCod ? Number(order.total) : 0,
      message: `تم تأكيد تسليم الطلب #${order.orderNumber} بنجاح`,
    };
  }

  /**
   * Driver marks delivery as Failed / Returned.
   */
  async failDelivery(tenantContext, branchId, orderId, { expectedVersion, reason } = {}) {
    await this.verifyBranchOwnership(tenantContext, branchId);
    const order = await deliveryRepository.findOrderById(tenantContext, branchId, orderId);
    if (!order) throw new NotFoundError("Order not found");

    if (order.status === "DELIVERED") {
      throw new BusinessRuleError("Cannot fail an already delivered order");
    }

    const fromStatus = order.status;
    const toStatus = "CANCELLED";
    const cancelReason = reason || "تعذر الوصول إلى العميل";

    const updated = await deliveryRepository.updateDeliveryStatus(tenantContext, orderId, {
      status: toStatus,
      cancelReason,
      expectedVersion,
    });

    if (updated.count === 0) {
      throw new ConflictError("Order was updated by another request. Please refresh and try again.");
    }

    await prisma.orderStatusHistory.create({
      data: {
        restaurantId: tenantContext.restaurantId,
        orderId,
        fromStatus,
        toStatus,
        changedById: tenantContext.employeeId || null,
        reason: `Delivery failed: ${cancelReason}`,
      },
    });

    emitEvent(DomainEvent.ORDER_STATUS_CHANGED, {
      restaurantId: tenantContext.restaurantId,
      branchId,
      orderId,
      fromStatus,
      toStatus,
      orderNumber: order.orderNumber,
      actorEmployeeId: tenantContext.employeeId || null,
    });

    return {
      orderId,
      orderNumber: order.orderNumber,
      status: toStatus,
      cancelReason,
      message: `تم تسجيل تعذر تسليم الطلب #${order.orderNumber}`,
    };
  }

  /**
   * Get driver's cash wallet reconciliation.
   */
  async getDriverWallet(tenantContext, branchId, driverId = null) {
    await this.verifyBranchOwnership(tenantContext, branchId);
    const targetDriverId = driverId || tenantContext.employeeId;
    if (!targetDriverId) throw new BusinessRuleError("Driver employee ID is required");

    return deliveryRepository.calculateDriverWallet(tenantContext, branchId, targetDriverId);
  }

  /**
   * Cashier settles COD cash with delivery driver.
   */
  async settleDriverCash(tenantContext, branchId, { driverEmployeeId, amount, notes }) {
    await this.verifyBranchOwnership(tenantContext, branchId);
    if (!driverEmployeeId) throw new BusinessRuleError("Driver ID is required");
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new BusinessRuleError("Valid settlement amount is required");
    }

    const record = await deliveryRepository.recordDriverSettlement(tenantContext, branchId, driverEmployeeId, {
      amount: numAmount,
      notes,
      settledByEmployeeId: tenantContext.employeeId || null,
    });

    const updatedWallet = await deliveryRepository.calculateDriverWallet(tenantContext, branchId, driverEmployeeId);

    return {
      settlementId: record.id,
      settledAmount: numAmount,
      remainingToSettle: updatedWallet.remainingToSettle,
      message: `تم استلام وتصفية عهدة الطيار بمبلغ ${numAmount.toFixed(2)} بنجاح`,
    };
  }

  /**
   * Cashier views all branch drivers with active wallets.
   */
  async getBranchDrivers(tenantContext, branchId) {
    await this.verifyBranchOwnership(tenantContext, branchId);
    const drivers = await deliveryRepository.findBranchDrivers(tenantContext, branchId);

    const results = [];
    for (const d of drivers) {
      const wallet = await deliveryRepository.calculateDriverWallet(tenantContext, branchId, d.id);
      results.push({
        ...d,
        wallet,
      });
    }

    return results;
  }
}

export const deliveryService = new DeliveryService();
export default deliveryService;
