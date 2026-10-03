import prisma from "../../lib/prisma.js";
import { ConflictError, NotFoundError, BusinessRuleError } from "../../shared/errors/index.js";
import { BaseRepository, assertTenantContext, getPaginationOffset } from "../../shared/repositories/base.repository.js";
import couponService from "../coupons/coupon.service.js";

function dateKeyInTimezone(date, timezone) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  }
}

export class OrderRepository extends BaseRepository {

  async findIdempotencyKey(restaurantId, key) {
    if (!restaurantId) return null;

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return prisma.idempotencyKey.findFirst({
      where: {
        restaurantId,
        key,
        createdAt: {
          gte: twentyFourHoursAgo,
        },
      },
    });
  }

  async findNextOrderNumber(restaurantId, branchId, tx = prisma, dateKey, startNumber) {
    const lastOrder = await tx.order.findFirst({
      where: {
        restaurantId,
        branchId,
        orderDate: dateKey,
      },
      orderBy: { orderNumber: "desc" },
      select: { orderNumber: true },
    });

    return lastOrder ? lastOrder.orderNumber + 1 : startNumber;
  }

  async findOrdersByBranch(tenantContext, branchId, { page = 1, limit = 20, status, type, source, tableId, date, q } = {}) {
    assertTenantContext(tenantContext);
    const { skip, take } = getPaginationOffset(page, limit);

    const andConditions = [];
    if (date) {
      andConditions.push({
        OR: [
          { orderDate: date },
          {
            createdAt: {
              gte: new Date(`${date}T00:00:00.000Z`),
              lte: new Date(`${date}T23:59:59.999Z`),
            },
          },
        ],
      });
    }
    if (q && q.trim()) {
      const trimmed = q.trim();
      andConditions.push({
        OR: [
          ...(Number.isInteger(Number(trimmed)) ? [{ orderNumber: Number(trimmed) }] : []),
          { id: { contains: trimmed, mode: "insensitive" } },
          { customer: { name: { contains: trimmed, mode: "insensitive" } } },
          { customer: { phone: { contains: trimmed, mode: "insensitive" } } },
        ],
      });
    }

    const where = {
      restaurantId: tenantContext.restaurantId,
      branchId,
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(source ? { source } : {}),
      ...(tableId ? { tableId } : {}),
      ...(andConditions.length ? { AND: andConditions } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take,
        include: {
          items: true,
          payments: {
            orderBy: { createdAt: "asc" },
          },
          table: {
            select: {
              id: true,
              label: true,
            },
          },
          customer: {
            select: { id: true, name: true, phone: true },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.order.count({ where }),
    ]);

    return { items, total };
  }

  async findOrdersByTenant(tenantContext, { page = 1, limit = 20, status, type, source, branchId, tableId } = {}) {
    assertTenantContext(tenantContext);
    const { skip, take } = getPaginationOffset(page, limit);

    const where = {
      restaurantId: tenantContext.restaurantId,
      ...(branchId ? { branchId } : {}),
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(source ? { source } : {}),
      ...(tableId ? { tableId } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take,
        include: {
          items: true,
          table: {
            select: {
              id: true,
              label: true,
            },
          },
          customer: {
            select: { id: true, name: true, phone: true },
          },
          branch: {
            select: { id: true, name: true, code: true },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.order.count({ where }),
    ]);

    return { items, total };
  }

  async findOrderById(tenantContext, branchId, orderId) {
    assertTenantContext(tenantContext);

    return prisma.order.findFirst({
      where: {
        id: orderId,
        branchId,
        restaurantId: tenantContext.restaurantId,
      },
      include: {
        items: true,
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            addresses: {
              select: {
                street: true,
                city: true,
              },
            },
          },
        },
        table: {
          select: {
            id: true,
            label: true,
            capacity: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        payments: {
          orderBy: { createdAt: "asc" },
        },
        statusHistory: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
  }

  async createOrderInClient(tx, tenantContext, branchId, orderPayload, itemsPayload, idempotencyKey = null, { startNumber, dateKey } = {}) {
    const restaurantId = tenantContext.restaurantId;

    if (orderPayload.tableId) {
      // A table legitimately holds multiple active orders: guests may order again
      // after the first round. The table stays OCCUPIED until its last active order
      // is delivered/cancelled (see updateOrderStatusWithHistoryTransaction).
      if (orderPayload.source !== "QR") {
        const activeSessionOnTable = await tx.tableSession.findFirst({
          where: {
            restaurantId,
            tableId: orderPayload.tableId,
            status: { in: ["ACTIVE", "AWAITING_CONFIRMATION", "CONFIRMED"] },
          },
          select: { id: true },
        });
        if (activeSessionOnTable) {
          throw new BusinessRuleError(
            `Table already has an active session. A table can only have one active session/order at a time`
          );
        }
      }
    }

    const orderNumber = await this.findNextOrderNumber(restaurantId, branchId, tx, dateKey, startNumber);

    const subtotal = Number(orderPayload.subtotal);
    let discountAmount = Number(orderPayload.discountAmount || 0);
    if (orderPayload.couponId) {
      const applied = await couponService.applyCouponForOrderInTransaction(tx, tenantContext, {
        couponId: orderPayload.couponId,
        orderSubtotal: subtotal,
        items: itemsPayload.map((i) => ({ productId: i.productId, subtotal: i.subtotal })),
      });
      discountAmount = applied.discountAmount;
    }
    const total = Math.max(0, subtotal - discountAmount);

    let activeShiftId = orderPayload.shiftId || null;
    if (!activeShiftId && tenantContext.employeeId) {
      const activeShift = await tx.shift.findFirst({
        where: {
          restaurantId,
          branchId,
          employeeId: tenantContext.employeeId,
          status: "OPEN",
        },
        select: { id: true },
      });
      activeShiftId = activeShift?.id || null;
    }

    const order = await tx.order.create({
      data: {
        orderNumber,
        orderDate: dateKey,
        restaurantId,
        branchId,
        shiftId: activeShiftId,
        source: orderPayload.source || "CASHIER",
        type: orderPayload.type || "DINE_IN",
        status: orderPayload.status || "PENDING",
        paymentStatus: orderPayload.paymentStatus || "PENDING",
        paymentMethod: orderPayload.paymentMethod || null,
        paidAt: orderPayload.paidAt || null,
        paidByEmployeeId: orderPayload.paidByEmployeeId || null,
        tableId: orderPayload.tableId || null,
        customerId: orderPayload.customerId || null,
        couponId: orderPayload.couponId || null,
        subtotal,
        discountAmount,
        total,
        notes: orderPayload.notes || null,
        address: orderPayload.address || null,
        version: 1,
      },
    });

    if (orderPayload.paymentStatus === "PAID" && total > 0) {
      await tx.orderPayment.create({
        data: {
          restaurantId,
          orderId: order.id,
          type: "PAYMENT",
          amount: total,
          paymentMethod: orderPayload.paymentMethod || "CASH",
          status: "PAID",
          employeeId: tenantContext.employeeId || null,
          shiftId: activeShiftId,
        },
      });
    }

    const itemsToCreate = itemsPayload.map((item) => ({
      restaurantId,
      orderId: order.id,
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
      notes: item.notes || null,
      selectedModifiers: item.selectedModifiers || null,
      round: item.round || 1,
    }));

    await tx.orderItem.createMany({
      data: itemsToCreate,
    });

    if (orderPayload.tableId) {
      await tx.restaurantTable.updateMany({
        where: {
          id: orderPayload.tableId,
          branchId,
          restaurantId,
          deletedAt: null,
        },
        data: {
          status: "OCCUPIED",
          updatedAt: new Date(),
        },
      });
    }

    await tx.orderStatusHistory.create({
      data: {
        restaurantId,
        orderId: order.id,
        fromStatus: null,
        toStatus: order.status,
        changedById: tenantContext.employeeId || null,
        reason: "Order created",
      },
    });

    if (idempotencyKey) {
      const responseData = {
        statusCode: 201,
        responseBody: {
          success: true,
          statusCode: 201,
          message: "Order created successfully",
          data: {
            ...order,
            items: itemsToCreate,
          },
        },
      };

      await tx.idempotencyKey.create({
        data: {
          restaurantId,
          key: idempotencyKey,
          statusCode: responseData.statusCode,
          responseBody: responseData.responseBody,
        },
      });
    }

    return tx.order.findFirst({
      where: { id: order.id, restaurantId },
      include: {
        items: true,
        customer: {
          select: { id: true, name: true, phone: true },
        },
        table: {
          select: { id: true, label: true },
        },
        statusHistory: true,
      },
    });
  }

  async createOrderTransaction(tenantContext, branchId, orderPayload, itemsPayload, idempotencyKey = null, txClient = null) {
    const restaurantId = tenantContext.restaurantId;

    const settings = await prisma.branchSettings.findFirst({ where: { branchId, restaurantId } });
    const startNumber = settings?.dailyOrderStartNumber || 200;
    const dateKey = dateKeyInTimezone(new Date(), settings?.timezone || undefined);
    const meta = { startNumber, dateKey };

    if (txClient) {
      return this.createOrderInClient(txClient, tenantContext, branchId, orderPayload, itemsPayload, idempotencyKey, meta);
    }

    const MAX_RETRIES = 3;
    for (let attempt = 0; ; attempt++) {
      try {
        return await prisma.$transaction(async (tx) =>
          this.createOrderInClient(tx, tenantContext, branchId, orderPayload, itemsPayload, idempotencyKey, meta)
        );
      } catch (err) {
        if (err?.code === "P2002" && attempt < MAX_RETRIES - 1) continue;
        throw err;
      }
    }
  }

  async appendItemsToOrder(tenantContext, branchId, orderId, itemsPayload, txClient = null) {
    const restaurantId = tenantContext.restaurantId;
    const run = async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, restaurantId, branchId },
      });
      if (!order) {
        throw new NotFoundError("Order not found");
      }

      const appendableStatuses = ["PENDING", "CONFIRMED", "PREPARING", "READY"];
      if (order.paymentStatus !== "PENDING") {
        throw new BusinessRuleError("Cannot append items to a paid or refunded order");
      }
      if (!appendableStatuses.includes(order.status)) {
        throw new BusinessRuleError(`Cannot append items to an order in status ${order.status}`);
      }

      const itemsToCreate = itemsPayload.map((item) => ({
        restaurantId,
        orderId: order.id,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
        notes: item.notes || null,
        selectedModifiers: item.selectedModifiers || null,
        round: item.round || 1,
      }));

      await tx.orderItem.createMany({ data: itemsToCreate });

      const newSubtotal =
        Number(order.subtotal) + itemsPayload.reduce((acc, i) => acc + Number(i.subtotal), 0);
      const newTotal = Math.max(0, newSubtotal - Number(order.discountAmount || 0));

      const updateResult = await tx.order.updateMany({
        where: {
          id: order.id,
          restaurantId,
          branchId,
          version: order.version,
          paymentStatus: "PENDING",
          status: { in: appendableStatuses },
        },
        data: {
          subtotal: newSubtotal,
          total: newTotal,
          version: order.version + 1,
          updatedAt: new Date(),
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictError("Order was modified by another request. Please refresh and retry.");
      }

      const roundAdded = Math.max(...itemsPayload.map((i) => Number(i.round || 1)));
      await tx.orderStatusHistory.create({
        data: {
          restaurantId,
          orderId: order.id,
          fromStatus: order.status,
          toStatus: order.status,
          changedById: tenantContext.employeeId || null,
          reason: `Order round ${roundAdded} added`,
        },
      });

      return order.id;
    };

    if (txClient) {
      return run(txClient);
    }
    return prisma.$transaction(run);
  }

  async updateOrderStatusWithHistoryTransaction(
    tenantContext,
    branchId,
    orderId,
    expectedVersion,
    currentStatus,
    newStatus,
    changedById,
    reason = null
  ) {
    const restaurantId = tenantContext.restaurantId;

    return prisma.$transaction(async (tx) => {
      const updateResult = await tx.order.updateMany({
        where: {
          id: orderId,
          branchId,
          restaurantId,
          version: expectedVersion,
        },
        data: {
          status: newStatus,
          version: expectedVersion + 1,
          ...(newStatus === "CANCELLED" && reason ? { cancelReason: reason } : {}),
          updatedAt: new Date(),
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictError("Order was modified by another request. Please refresh and retry.");
      }

      await tx.orderStatusHistory.create({
        data: {
          restaurantId,
          orderId,
          fromStatus: currentStatus,
          toStatus: newStatus,
          changedById: changedById || null,
          reason: reason || `Status updated from ${currentStatus} to ${newStatus}`,
        },
      });

        if (newStatus === "DELIVERED" || newStatus === "CANCELLED") {
        const orderData = await tx.order.findFirst({
          where: { id: orderId, branchId, restaurantId },
          select: { tableId: true, couponId: true },
        });

        if (newStatus === "CANCELLED" && orderData?.couponId) {
          await tx.coupon.updateMany({
            where: { id: orderData.couponId, restaurantId, timesUsed: { gt: 0 } },
            data: { timesUsed: { decrement: 1 }, updatedAt: new Date() },
          });
        }

        if (orderData?.tableId) {
          const activeCount = await tx.order.count({
            where: {
              restaurantId,
              branchId,
              tableId: orderData.tableId,
              id: { not: orderId },
              status: { notIn: ["DELIVERED", "CANCELLED"] },
            },
          });

          if (activeCount === 0) {
            await tx.restaurantTable.updateMany({
              where: {
                id: orderData.tableId,
                branchId,
                restaurantId,
                deletedAt: null,
              },
              data: {
                status: "AVAILABLE",
                updatedAt: new Date(),
              },
            });
          }
        }
      }

      return true;
    });
  }

  async updateOrderPaymentWithHistoryTransaction(
    tenantContext,
    branchId,
    orderId,
    expectedVersion,
    payload
  ) {
    const restaurantId = tenantContext.restaurantId;
    const paymentAmount = Number(payload.amount);
    const idempotencyKey = payload.idempotencyKey || null;

    return prisma.$transaction(async (tx) => {
      // 1. If idempotency key provided, check if payment was already recorded
      if (idempotencyKey) {
        const existingPayment = await tx.orderPayment.findFirst({
          where: {
            restaurantId,
            idempotencyKey,
          },
        });
        if (existingPayment) {
          return true;
        }
      }

      // 2. Lock & verify current order state
      const orderBefore = await tx.order.findFirst({
        where: { id: orderId, branchId, restaurantId },
        select: {
          id: true,
          status: true,
          tableId: true,
          total: true,
          amountPaid: true,
          paymentStatus: true,
          version: true,
        },
      });

      if (!orderBefore) {
        throw new NotFoundError("Order not found");
      }

      if (orderBefore.status === "CANCELLED") {
        throw new BusinessRuleError("Cannot process payment for cancelled order");
      }

      if (orderBefore.paymentStatus === "PAID") {
        throw new BusinessRuleError("Order is already paid");
      }

      if (orderBefore.paymentStatus === "REFUNDED") {
        throw new BusinessRuleError("Cannot process payment for refunded order");
      }

      if (paymentAmount <= 0) {
        throw new BusinessRuleError("Payment amount must be greater than 0");
      }

      const total = Number(orderBefore.total);
      const currentAmountPaid = Number(orderBefore.amountPaid || 0);
      const remaining = Math.max(0, total - currentAmountPaid);

      if (paymentAmount > remaining + 0.001) {
        throw new BusinessRuleError(`Payment amount (${paymentAmount}) exceeds remaining balance of ${remaining.toFixed(2)}`);
      }

      const newAmountPaid = Number((currentAmountPaid + paymentAmount).toFixed(2));
      const isFullPayment = newAmountPaid >= total - 0.001;
      const newPaymentStatus = isFullPayment ? "PAID" : "PARTIAL";

      let activeShiftId = payload.shiftId || null;
      if (!activeShiftId && tenantContext.employeeId) {
        const activeShift = await tx.shift.findFirst({
          where: {
            restaurantId,
            branchId,
            employeeId: tenantContext.employeeId,
            status: "OPEN",
          },
          select: { id: true },
        });
        activeShiftId = activeShift?.id || null;
      }

      // 3. Create OrderPayment record
      await tx.orderPayment.create({
        data: {
          restaurantId,
          orderId,
          type: "PAYMENT",
          amount: paymentAmount,
          paymentMethod: payload.paymentMethod,
          status: isFullPayment ? "PAID" : "PARTIAL",
          idempotencyKey,
          employeeId: tenantContext.employeeId || null,
          shiftId: activeShiftId,
        },
      });

      // 4. Update Order with version check
      const currentVersion = expectedVersion !== undefined && expectedVersion !== null ? expectedVersion : orderBefore.version;
      const updateResult = await tx.order.updateMany({
        where: {
          id: orderId,
          branchId,
          restaurantId,
          version: currentVersion,
          paymentStatus: { in: ["PENDING", "PARTIAL"] },
        },
        data: {
          amountPaid: newAmountPaid,
          paymentStatus: newPaymentStatus,
          paymentMethod: payload.paymentMethod,
          paidAt: new Date(),
          paidByEmployeeId: tenantContext.employeeId || null,
          shiftId: activeShiftId || orderBefore.shiftId || null,
          version: currentVersion + 1,
          updatedAt: new Date(),
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictError("Order was modified by another request. Please refresh and retry.");
      }

      // 5. Audit history
      await tx.orderStatusHistory.create({
        data: {
          restaurantId,
          orderId,
          fromStatus: orderBefore.status,
          toStatus: orderBefore.status,
          changedById: tenantContext.employeeId || null,
          reason: `Payment processed: ${paymentAmount.toFixed(2)} via ${payload.paymentMethod} (${newPaymentStatus})`,
        },
      });

      if (orderBefore.tableId && orderBefore.status === "DELIVERED" && newPaymentStatus === "PAID") {
        const activeCount = await tx.order.count({
          where: {
            restaurantId,
            branchId,
            tableId: orderBefore.tableId,
            id: { not: orderId },
            status: { in: ["PENDING", "CONFIRMED", "PREPARING", "READY"] },
          },
        });

        if (activeCount === 0) {
          await tx.restaurantTable.updateMany({
            where: {
              id: orderBefore.tableId,
              branchId,
              restaurantId,
              deletedAt: null,
            },
            data: {
              status: "AVAILABLE",
              updatedAt: new Date(),
            },
          });
        }
      }

      return true;
    });
  }

  async updateOrderRefundWithHistoryTransaction(
    tenantContext,
    branchId,
    orderId,
    expectedVersion,
    payload
  ) {
    const restaurantId = tenantContext.restaurantId;

    return prisma.$transaction(async (tx) => {
      const orderBefore = await tx.order.findFirst({
        where: { id: orderId, branchId, restaurantId },
        select: { status: true, amountPaid: true, total: true, paymentMethod: true, paymentStatus: true, version: true },
      });

      if (!orderBefore) {
        throw new NotFoundError("Order not found");
      }

      if (orderBefore.paymentStatus !== "PAID" && orderBefore.paymentStatus !== "PARTIAL") {
        throw new BusinessRuleError("Only paid or partially paid orders can be refunded");
      }

      let activeShiftId = payload.shiftId || null;
      if (!activeShiftId && tenantContext.employeeId) {
        const activeShift = await tx.shift.findFirst({
          where: {
            restaurantId,
            branchId,
            employeeId: tenantContext.employeeId,
            status: "OPEN",
          },
          select: { id: true },
        });
        activeShiftId = activeShift?.id || null;
      }

      // Create REFUND OrderPayment record
      await tx.orderPayment.create({
        data: {
          restaurantId,
          orderId,
          type: "REFUND",
          amount: refundAmount,
          paymentMethod: orderBefore.paymentMethod || "CASH",
          status: "REFUNDED",
          employeeId: tenantContext.employeeId || null,
          shiftId: activeShiftId,
        },
      });

      const currentVersion = expectedVersion !== undefined && expectedVersion !== null ? expectedVersion : orderBefore.version;
      const updateResult = await tx.order.updateMany({
        where: {
          id: orderId,
          branchId,
          restaurantId,
          version: currentVersion,
        },
        data: {
          amountPaid: 0.00,
          paymentStatus: "REFUNDED",
          refundedAt: new Date(),
          refundReason: payload.reason,
          refundedByEmployeeId: tenantContext.employeeId || null,
          version: currentVersion + 1,
          updatedAt: new Date(),
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictError("Order was modified by another request. Please refresh and retry.");
      }

      await tx.orderStatusHistory.create({
        data: {
          restaurantId,
          orderId,
          fromStatus: orderBefore.status,
          toStatus: orderBefore.status,
          changedById: tenantContext.employeeId || null,
          reason: `Payment refunded: ${payload.reason}`,
        },
      });

      return true;
    });
  }

  async findOrderHistory(tenantContext, branchId, orderId) {
    const order = await this.findOrderById(tenantContext, branchId, orderId);
    if (!order) return null;

    return prisma.orderStatusHistory.findMany({
      where: {
        restaurantId: tenantContext.restaurantId,
        orderId,
      },
      orderBy: { createdAt: "asc" },
    });
  }
}

export const orderRepository = new OrderRepository();
export default orderRepository;
