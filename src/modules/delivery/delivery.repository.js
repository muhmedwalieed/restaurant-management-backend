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
        driver: {
          select: {
            id: true,
            name: true,
            email: true,
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
        driver: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        items: true,
        payments: true,
        statusHistory: {
          orderBy: { createdAt: "desc" },
        },
      },
    });
  }

  /**
   * Find all delivery orders pending cashier handover in a branch.
   */
  async findPendingHandovers(tenantContext, branchId) {
    assertTenantContext(tenantContext);
    return prisma.order.findMany({
      where: {
        restaurantId: tenantContext.restaurantId,
        branchId,
        type: "DELIVERY",
        OR: [
          {
            deliveryStatus: "PENDING_HANDOVER",
          },
          {
            deliveryStatus: { in: ["FAILED_DELIVERY", "RETURNED_TO_CASHIER"] },
          },
          {
            status: "CANCELLED",
            NOT: {
              deliveryStatus: "RETURN_CONFIRMED",
            },
          },
        ],
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        driver: {
          select: {
            id: true,
            name: true,
            email: true,
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
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  /**
   * Driver hands over returned order to cashier.
   */
  async handoverReturnOrder(tenantContext, branchId, orderId, driverEmployeeId) {
    assertTenantContext(tenantContext);
    const data = {
      deliveryStatus: "RETURNED_TO_CASHIER",
      driverRequestedAt: new Date(),
      version: { increment: 1 },
    };
    if (driverEmployeeId) {
      data.driverEmployeeId = driverEmployeeId;
    }
    return prisma.order.updateMany({
      where: {
        id: orderId,
        restaurantId: tenantContext.restaurantId,
        branchId,
      },
      data,
    });
  }

  /**
   * Cashier confirms receiving the returned items from driver.
   */
  async confirmReturnOrder(tenantContext, branchId, orderId) {
    assertTenantContext(tenantContext);
    return prisma.order.updateMany({
      where: {
        id: orderId,
        restaurantId: tenantContext.restaurantId,
        branchId,
      },
      data: {
        deliveryStatus: "RETURN_CONFIRMED",
        version: { increment: 1 },
      },
    });
  }

  /**
   * Driver requests pickup approval from cashier.
   */
  async requestPickup(tenantContext, branchId, orderId, driverEmployeeId) {
    assertTenantContext(tenantContext);
    return prisma.order.updateMany({
      where: {
        id: orderId,
        restaurantId: tenantContext.restaurantId,
        branchId,
      },
      data: {
        driverEmployeeId,
        deliveryStatus: "PENDING_HANDOVER",
        driverRequestedAt: new Date(),
        version: { increment: 1 },
      },
    });
  }

  /**
   * Cashier approves handover to driver.
   */
  async approvePickup(tenantContext, branchId, orderId, driverEmployeeId) {
    assertTenantContext(tenantContext);
    return prisma.order.updateMany({
      where: {
        id: orderId,
        restaurantId: tenantContext.restaurantId,
        branchId,
      },
      data: {
        status: "OUT_FOR_DELIVERY",
        deliveryStatus: "OUT_FOR_DELIVERY",
        driverEmployeeId,
        paidByEmployeeId: driverEmployeeId, // Links driver for COD collection tracking
        version: { increment: 1 },
      },
    });
  }

  /**
   * Cashier rejects handover to driver.
   */
  async rejectPickup(tenantContext, branchId, orderId, reason) {
    assertTenantContext(tenantContext);
    return prisma.order.updateMany({
      where: {
        id: orderId,
        restaurantId: tenantContext.restaurantId,
        branchId,
      },
      data: {
        deliveryStatus: "REJECTED",
        driverEmployeeId: null,
        driverNotes: reason || "تم رفض التسليم من قبل الكاشير",
        version: { increment: 1 },
      },
    });
  }

  /**
   * Driver cancels own pickup request.
   */
  async cancelPickup(tenantContext, branchId, orderId, driverEmployeeId) {
    assertTenantContext(tenantContext);
    return prisma.order.updateMany({
      where: {
        id: orderId,
        restaurantId: tenantContext.restaurantId,
        branchId,
        driverEmployeeId,
        deliveryStatus: "PENDING_HANDOVER",
      },
      data: {
        deliveryStatus: null,
        driverEmployeeId: null,
        driverRequestedAt: null,
        version: { increment: 1 },
      },
    });
  }

  /**
   * Cashier assigns delivery order to a driver (pending driver acceptance).
   */
  async assignDriverToOrder(tenantContext, branchId, orderId, driverEmployeeId) {
    assertTenantContext(tenantContext);
    return prisma.order.updateMany({
      where: {
        id: orderId,
        restaurantId: tenantContext.restaurantId,
        branchId,
      },
      data: {
        driverEmployeeId,
        deliveryStatus: "PENDING_DRIVER_ACCEPTANCE",
        driverRequestedAt: new Date(),
        version: { increment: 1 },
      },
    });
  }

  /**
   * Driver accepts assignment from cashier (marks order as OUT_FOR_DELIVERY).
   */
  async acceptDriverAssignment(tenantContext, branchId, orderId, driverEmployeeId) {
    assertTenantContext(tenantContext);
    return prisma.order.updateMany({
      where: {
        id: orderId,
        restaurantId: tenantContext.restaurantId,
        branchId,
        driverEmployeeId,
      },
      data: {
        status: "OUT_FOR_DELIVERY",
        deliveryStatus: "OUT_FOR_DELIVERY",
        paidByEmployeeId: driverEmployeeId,
        version: { increment: 1 },
      },
    });
  }

  /**
   * Driver rejects assignment from cashier.
   */
  async rejectDriverAssignment(tenantContext, branchId, orderId, driverEmployeeId, reason) {
    assertTenantContext(tenantContext);
    return prisma.order.updateMany({
      where: {
        id: orderId,
        restaurantId: tenantContext.restaurantId,
        branchId,
        driverEmployeeId,
      },
      data: {
        deliveryStatus: null,
        driverEmployeeId: null,
        driverNotes: reason || "تم رفض استلام الطلب من قبل المندوب",
        version: { increment: 1 },
      },
    });
  }

  /**
   * Cashier cancels driver assignment request.
   */
  async cancelDriverAssignment(tenantContext, branchId, orderId) {
    assertTenantContext(tenantContext);
    return prisma.order.updateMany({
      where: {
        id: orderId,
        restaurantId: tenantContext.restaurantId,
        branchId,
      },
      data: {
        deliveryStatus: null,
        driverEmployeeId: null,
        version: { increment: 1 },
      },
    });
  }

  /**
   * Update order delivery status and optionally record payment.
   */
  async updateDeliveryStatus(tenantContext, orderId, { status, deliveryStatus, paymentStatus, paymentMethod, amountPaid, cancelReason, expectedVersion }) {
    assertTenantContext(tenantContext);
    const now = new Date();

    const data = {
      status,
      updatedAt: now,
      version: { increment: 1 },
    };

    if (deliveryStatus !== undefined) {
      data.deliveryStatus = deliveryStatus;
    } else if (status) {
      data.deliveryStatus = status;
    }
    if (paymentStatus) {
      data.paymentStatus = paymentStatus;
    }
    if (paymentMethod) {
      data.paymentMethod = paymentMethod;
    }
    if (amountPaid !== undefined) {
      data.amountPaid = amountPaid;
      data.paidAt = now;
      if (tenantContext.employeeId) {
        data.paidByEmployeeId = tenantContext.employeeId;
      }
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
   * Calculates:
   * 1. Delivered cash orders (already collected by driver).
   * 2. In-transit COD orders (currently out on the road with driver).
   * 3. Total settlements recorded by cashier.
   * 4. Remaining cash due to settle and total custody.
   */
  async calculateDriverWallet(tenantContext, branchId, driverEmployeeId) {
    assertTenantContext(tenantContext);

    // 1. All delivered cash orders collected by this driver
    const cashOrders = await prisma.order.findMany({
      where: {
        restaurantId: tenantContext.restaurantId,
        branchId,
        type: "DELIVERY",
        status: "DELIVERED",
        OR: [
          { driverEmployeeId },
          { paidByEmployeeId: driverEmployeeId },
        ],
        AND: [
          {
            OR: [
              { paymentMethod: "CASH" },
              { paymentMethod: null },
            ],
          },
        ],
      },
      select: {
        id: true,
        orderNumber: true,
        total: true,
        paymentStatus: true,
        paymentMethod: true,
        paidAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    // 2. Orders currently OUT_FOR_DELIVERY with the driver (COD in transit)
    const inTransitOrders = await prisma.order.findMany({
      where: {
        restaurantId: tenantContext.restaurantId,
        branchId,
        type: "DELIVERY",
        status: "OUT_FOR_DELIVERY",
        driverEmployeeId,
        AND: [
          {
            OR: [
              { paymentMethod: "CASH" },
              { paymentMethod: null },
            ],
          },
        ],
      },
      select: {
        id: true,
        orderNumber: true,
        total: true,
        paymentStatus: true,
        paymentMethod: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const totalCollected = cashOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const inTransitAmount = inTransitOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);

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
    const totalCustody = remainingToSettle + inTransitAmount;

    return {
      driverEmployeeId,
      totalCollected,
      totalSettled,
      remainingToSettle,
      inTransitAmount,
      totalCustody,
      ordersCount: cashOrders.length,
      orders: cashOrders,
      inTransitOrders,
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

    // 1. Fetch active employees belonging to branch or with branch access
    const branchEmployees = await prisma.employee.findMany({
      where: {
        restaurantId: tenantContext.restaurantId,
        deletedAt: null,
        status: "ACTIVE",
        OR: [
          { branchId },
          { branchAccesses: { some: { branchId } } },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: {
          select: {
            id: true,
            name: true,
            permissions: {
              select: {
                permission: {
                  select: { key: true },
                },
              },
            },
          },
        },
        driverOrders: {
          where: {
            restaurantId: tenantContext.restaurantId,
            branchId,
          },
          select: { id: true },
          take: 1,
        },
      },
    });

    // 2. Filter employees who are delivery drivers OR have delivery permissions OR have delivery orders
    const deliveryKeywords = ["delivery", "driver", "طيار", "دليفري", "توصيل", "سائق", "مندوب", "كابتن"];

    const filtered = branchEmployees.filter((emp) => {
      const roleName = (emp.role?.name || "").toLowerCase();
      const matchesKeyword = deliveryKeywords.some((kw) => roleName.includes(kw.toLowerCase()));
      const hasPermission = emp.role?.permissions?.some((p) =>
        ["delivery.view", "delivery.update_status", "delivery.settle", "orders.view"].includes(p.permission?.key)
      );
      const hasOrders = emp.driverOrders && emp.driverOrders.length > 0;

      return matchesKeyword || hasPermission || hasOrders;
    });

    // If filtered list is empty, return branch employees so cashier is never blocked
    const result = filtered.length > 0 ? filtered : branchEmployees;

    return result.map((e) => ({
      id: e.id,
      name: e.name,
      email: e.email,
      phone: e.phone,
    }));
  }
}

export const deliveryRepository = new DeliveryRepository();
export default deliveryRepository;
