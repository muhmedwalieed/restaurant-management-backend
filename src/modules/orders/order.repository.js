import prisma from "../../lib/prisma.js";
import { AuthenticationError, ConflictError } from "../../shared/errors/index.js";

export class OrderRepository {
  /**
   * Finds idempotent key entry within 24 hours.
   */
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

  /**
   * Calculates the next sequential order number for a branch.
   */
  async findNextOrderNumber(restaurantId, branchId, tx = prisma) {
    const lastOrder = await tx.order.findFirst({
      where: {
        restaurantId,
        branchId,
      },
      orderBy: { orderNumber: "desc" },
      select: { orderNumber: true },
    });

    return (lastOrder?.orderNumber || 1000) + 1;
  }

  /**
   * Finds orders for a specific branch with filters and pagination.
   */
  async findOrdersByBranch(tenantContext, branchId, { page = 1, limit = 20, status, type, source } = {}) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    const skip = (page - 1) * limit;
    const where = {
      restaurantId: tenantContext.restaurantId,
      branchId,
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(source ? { source } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        include: {
          items: true,
          table: {
            select: {
              id: true,
              label: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.order.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * Finds single order by ID under a specific branch.
   */
  async findOrderById(tenantContext, branchId, orderId) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    return prisma.order.findFirst({
      where: {
        id: orderId,
        branchId,
        restaurantId: tenantContext.restaurantId,
      },
      include: {
        items: true,
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
        statusHistory: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
  }

  /**
   * Creates an order with items, status history, and optional idempotency key inside a single transaction.
   */
  async createOrderTransaction(tenantContext, branchId, orderPayload, itemsPayload, idempotencyKey = null) {
    const restaurantId = tenantContext.restaurantId;

    return prisma.$transaction(async (tx) => {
      // 1. Calculate next orderNumber
      const orderNumber = await this.findNextOrderNumber(restaurantId, branchId, tx);

      // 2. Create Order
      const order = await tx.order.create({
        data: {
          orderNumber,
          restaurantId,
          branchId,
          source: orderPayload.source || "CASHIER",
          type: orderPayload.type || "DINE_IN",
          status: "PENDING",
          paymentStatus: orderPayload.paymentStatus || "PENDING",
          paymentMethod: orderPayload.paymentMethod || null,
          tableId: orderPayload.tableId || null,
          customerId: orderPayload.customerId || null,
          couponId: orderPayload.couponId || null,
          subtotal: orderPayload.subtotal,
          discountAmount: orderPayload.discountAmount || 0,
          total: orderPayload.total,
          notes: orderPayload.notes || null,
          version: 1,
        },
      });

      // 3. Create OrderItems
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
      }));

      await tx.orderItem.createMany({
        data: itemsToCreate,
      });

      // 4. Create Initial OrderStatusHistory
      await tx.orderStatusHistory.create({
        data: {
          restaurantId,
          orderId: order.id,
          fromStatus: null,
          toStatus: "PENDING",
          changedById: tenantContext.employeeId || null,
          reason: "Order created",
        },
      });

      // 5. Save IdempotencyKey if provided
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

      // Fetch full order with items for controller response
      return tx.order.findFirst({
        where: { id: order.id, restaurantId },
        include: {
          items: true,
          table: {
            select: { id: true, label: true },
          },
          statusHistory: true,
        },
      });
    });
  }

  /**
   * Executes Atomic Optimistic Update + Status History creation inside a single $transaction (Section 25.3).
   */
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

      return true;
    });
  }

  /**
   * Finds order status history timeline.
   */
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
