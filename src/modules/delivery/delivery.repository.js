import prisma from "../../lib/prisma.js";
import { BaseRepository, assertTenantContext } from "../../shared/repositories/base.repository.js";

export class DeliveryRepository extends BaseRepository {
  /**
   * Find all delivery orders for a branch, optionally filtered by status.
   */
  async findDeliveryOrders(tenantContext, branchId, { status, driverId } = {}) {
    assertTenantContext(tenantContext);

    const where = {
      restaurantId: tenantContext.restaurantId,
      branchId,
      type: "DELIVERY",
    };

    if (status === "ACTIVE") {
      // Orders ready for pickup or currently out for delivery
      where.status = { in: ["READY", "OUT_FOR_DELIVERY", "CONFIRMED", "PREPARING"] };
    } else if (status === "COMPLETED") {
      where.status = { in: ["DELIVERED", "CANCELLED"] };
    } else if (status) {
      where.status = status;
    }

    return prisma.order.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        items: {
          select: {
            id: true,
            productId: true,
            productName: true,
            quantity: true,
            unitPrice: true,
            subtotal: true,
            notes: true,
            selectedModifiers: true,
          },
        },
        statusHistory: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
      orderBy: [{ createdAt: "desc" }],
    });
  }

  /**
   * Find a specific order by ID and verify tenant & branch.
   */
  async findOrderById(tenantContext, branchId, orderId) {
    assertTenantContext(tenantContext);
    return prisma.order.findFirst({
      where: {
        id: orderId,
        restaurantId: tenantContext.restaurantId,
        branchId,
      },
      include: {
        customer: true,
        items: true,
        payments: true,
        statusHistory: {
          orderBy: { createdAt: "desc" },
        },
      },
    });
  }

  /**
   * Update order delivery status and optionally record payment.
   */
  async updateDeliveryStatus(tenantContext, orderId, { status, paymentStatus, paymentMethod, amountPaid, cancelReason, expectedVersion }) {
    assertTenantContext(tenantContext);
    const now = new Date();

    const data = {
      status,
      updatedAt: now,
      version: { increment: 1 },
    };

    if (paymentStatus) {
      data.paymentStatus = paymentStatus;
    }
    if (paymentMethod) {
      data.paymentMethod = paymentMethod;
    }
    if (amountPaid !== undefined) {
      data.amountPaid = amountPaid;
      data.paidAt = now;
      data.paidByEmployeeId = tenantContext.employeeId || null;
    }
    if (cancelReason) {
      data.cancelReason = cancelReason;
    }

    const where = {
      id: orderId,
      restaurantId: tenantContext.restaurantId,
    };
    if (expectedVersion) {
      where.version = expectedVersion;
    }

    return prisma.order.updateMany({
      where,
      data,
    });
  }

  /**
   * Calculate driver COD wallet summary for a given driver.
   * Finds all delivered orders where paidByEmployeeId is the driver and paymentMethod is CASH.
   */
  async calculateDriverWallet(tenantContext, branchId, driverEmployeeId) {
    assertTenantContext(tenantContext);

    // All delivered cash orders collected by this driver
    const cashOrders = await prisma.order.findMany({
      where: {
        restaurantId: tenantContext.restaurantId,
        branchId,
        type: "DELIVERY",
        status: "DELIVERED",
        paymentStatus: "PAID",
        paymentMethod: "CASH",
        paidByEmployeeId: driverEmployeeId,
      },
      select: {
        id: true,
        orderNumber: true,
        total: true,
        paidAt: true,
        createdAt: true,
      },
      orderBy: { paidAt: "desc" },
    });

    const totalCollected = cashOrders.reduce((sum, o) => sum + Number(o.total), 0);

    // Check for settlement logs for this driver
    const settlements = await prisma.auditLog.findMany({
      where: {
        restaurantId: tenantContext.restaurantId,
        branchId,
        action: "DRIVER_COD_SETTLED",
        entityId: driverEmployeeId,
      },
      orderBy: { createdAt: "desc" },
    });

    const totalSettled = settlements.reduce((sum, s) => {
      const amount = s.metadata && typeof s.metadata === "object" ? Number(s.metadata.amount || 0) : 0;
      return sum + amount;
    }, 0);

    const remainingToSettle = Math.max(0, totalCollected - totalSettled);

    return {
      driverEmployeeId,
      totalCollected,
      totalSettled,
      remainingToSettle,
      ordersCount: cashOrders.length,
      orders: cashOrders,
      settlements: settlements.map((s) => ({
        id: s.id,
        amount: s.metadata?.amount || 0,
        settledAt: s.createdAt,
        actorEmployeeId: s.actorEmployeeId,
        notes: s.metadata?.notes || null,
      })),
    };
  }

  /**
   * Settle driver COD cash with cashier.
   */
  async recordDriverSettlement(tenantContext, branchId, driverEmployeeId, { amount, notes, settledByEmployeeId }) {
    assertTenantContext(tenantContext);

    return prisma.auditLog.create({
      data: {
        restaurantId: tenantContext.restaurantId,
        branchId,
        actorEmployeeId: settledByEmployeeId,
        action: "DRIVER_COD_SETTLED",
        entityType: "employee",
        entityId: driverEmployeeId,
        metadata: {
          amount: Number(amount),
          notes: notes || "Driver COD cash settled with cashier",
          settledAt: new Date().toISOString(),
        },
      },
    });
  }

  /**
   * Find all delivery drivers in branch with active COD balances.
   */
  async findBranchDrivers(tenantContext, branchId) {
    assertTenantContext(tenantContext);

    const drivers = await prisma.employee.findMany({
      where: {
        restaurantId: tenantContext.restaurantId,
        branchId,
        deletedAt: null,
        status: "ACTIVE",
        role: {
          name: { in: ["delivery", "driver", "طيار", "مندوب توصيل", "Delivery"] },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
      },
    });

    return drivers;
  }
}

export const deliveryRepository = new DeliveryRepository();
export default deliveryRepository;
