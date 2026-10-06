import prisma from "../../lib/prisma.js";
import { BaseRepository, assertTenantContext } from "../../shared/repositories/base.repository.js";

export class ShiftRepository extends BaseRepository {
  constructor() {
    super(prisma.shift);
  }

  /**
   * Find active open shift for a specific employee in a branch.
   */
  async findActiveShiftByEmployee(tenantContext, branchId, employeeId) {
    assertTenantContext(tenantContext);
    return prisma.shift.findFirst({
      where: {
        restaurantId: tenantContext.restaurantId,
        branchId,
        employeeId,
        status: "OPEN",
      },
      include: {
        employee: {
          select: { id: true, name: true, email: true, phone: true },
        },
        cashMovements: {
          orderBy: { createdAt: "desc" },
        },
      },
    });
  }

  /**
   * Find any active open shift in a branch (useful if fallback terminal shift).
   */
  async findActiveBranchShifts(tenantContext, branchId) {
    assertTenantContext(tenantContext);
    return prisma.shift.findMany({
      where: {
        restaurantId: tenantContext.restaurantId,
        branchId,
        status: "OPEN",
      },
      include: {
        employee: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { openedAt: "desc" },
    });
  }

  /**
   * Find shift by ID with detailed aggregates.
   */
  async findShiftById(tenantContext, shiftId) {
    assertTenantContext(tenantContext);
    return prisma.shift.findFirst({
      where: {
        restaurantId: tenantContext.restaurantId,
        id: shiftId,
      },
      include: {
        employee: {
          select: { id: true, name: true, email: true, phone: true },
        },
        cashMovements: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
  }

  /**
   * Get next shift number for the branch.
   */
  async getNextShiftNumber(tenantContext, branchId) {
    assertTenantContext(tenantContext);
    const count = await prisma.shift.count({
      where: {
        restaurantId: tenantContext.restaurantId,
        branchId,
      },
    });
    return count + 1;
  }

  /**
   * Create and open a new shift.
   */
  async createShift(tenantContext, data) {
    assertTenantContext(tenantContext);
    return prisma.shift.create({
      data: {
        restaurantId: tenantContext.restaurantId,
        ...data,
      },
      include: {
        employee: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  /**
   * Compute live financial figures for a shift from payments and cash movements.
   */
  async calculateLiveShiftTotals(tenantContext, shiftId) {
    assertTenantContext(tenantContext);
    const shift = await prisma.shift.findFirst({
      where: {
        restaurantId: tenantContext.restaurantId,
        id: shiftId,
      },
    });

    if (!shift) return null;

    // 1. All Payments linked to this shift
    const payments = await prisma.orderPayment.findMany({
      where: {
        restaurantId: tenantContext.restaurantId,
        shiftId,
        status: { in: ["PAID", "REFUNDED", "COMPLETED"] },
      },
      include: {
        order: {
          select: { id: true, orderNumber: true, total: true, discountAmount: true, status: true },
        },
      },
    });

    let cashSales = 0;
    let cardSales = 0;
    let instaPaySales = 0;
    let walletSales = 0;
    let totalRefunds = 0;
    let cashRefunds = 0;
    let refundsCount = 0;

    for (const p of payments) {
      const amount = Number(p.amount) || 0;
      if (p.type === "REFUND") {
        totalRefunds += amount;
        refundsCount += 1;
        if (p.paymentMethod === "CASH" || !p.paymentMethod) {
          cashRefunds += amount;
        }
      } else {
        switch (p.paymentMethod) {
          case "CASH":
            cashSales += amount;
            break;
          case "CARD":
            cardSales += amount;
            break;
          case "INSTAPAY":
            instaPaySales += amount;
            break;
          case "WALLET":
            walletSales += amount;
            break;
          default:
            cashSales += amount;
        }
      }
    }

    // 2. Orders Count & Discounts
    const orders = await prisma.order.findMany({
      where: {
        restaurantId: tenantContext.restaurantId,
        shiftId,
      },
      select: {
        id: true,
        discountAmount: true,
        total: true,
        status: true,
      },
    });

    const activeOrders = orders.filter((o) => o.status !== "CANCELLED");
    const cancelledOrdersCount = orders.filter((o) => o.status === "CANCELLED").length;
    const ordersCount = activeOrders.length;
    const totalDiscounts = activeOrders.reduce((sum, o) => sum + (Number(o.discountAmount) || 0), 0);
    const totalSales = cashSales + cardSales + instaPaySales + walletSales;
    const netSales = totalSales - totalRefunds;

    // 3. Cash Movements during shift (Pay In / Pay Out)
    const cashMovements = await prisma.shiftCashMovement.findMany({
      where: {
        restaurantId: tenantContext.restaurantId,
        shiftId,
      },
    });

    let cashIn = 0;
    let cashOut = 0;
    for (const m of cashMovements) {
      const amt = Number(m.amount) || 0;
      if (m.type === "CASH_IN") cashIn += amt;
      if (m.type === "CASH_OUT") cashOut += amt;
    }

    // 4. Driver Settlements collected by this shift's cashier during shift duration
    const driverSettlementLogs = await prisma.auditLog.findMany({
      where: {
        restaurantId: tenantContext.restaurantId,
        action: "DRIVER_COD_SETTLED",
        actorEmployeeId: shift.employeeId,
        createdAt: {
          gte: shift.openedAt,
          ...(shift.closedAt ? { lte: shift.closedAt } : {}),
        },
      },
    });

    let driverSettlementCash = 0;
    for (const log of driverSettlementLogs) {
      const meta = log.metadata || {};
      driverSettlementCash += Number(meta.amount) || 0;
    }

    const startingCash = Number(shift.startingCash) || 0;
    const expectedCash = startingCash + cashSales + driverSettlementCash + cashIn - cashRefunds - cashOut;

    return {
      startingCash,
      cashSales,
      cardSales,
      instaPaySales,
      walletSales,
      totalSales,
      netSales,
      totalDiscounts,
      driverSettlementCash,
      cashIn,
      cashOut,
      totalRefunds,
      cashRefunds,
      refundsCount,
      ordersCount,
      cancelledOrdersCount,
      expectedCash,
      cashMovements,
    };
  }

  /**
   * Add a cash movement (Pay In / Pay Out).
   */
  async addCashMovement(tenantContext, data) {
    assertTenantContext(tenantContext);
    return prisma.shiftCashMovement.create({
      data: {
        restaurantId: tenantContext.restaurantId,
        ...data,
      },
    });
  }

  /**
   * Close a shift with finalized calculated values and counted cash.
   */
  async closeShift(tenantContext, shiftId, closePayload) {
    assertTenantContext(tenantContext);
    return prisma.shift.updateMany({
      where: {
        restaurantId: tenantContext.restaurantId,
        id: shiftId,
        status: "OPEN",
      },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
        ...closePayload,
      },
    });
  }

  /**
   * List shifts history with filters.
   */
  async listShifts(tenantContext, branchId, { employeeId, status, fromDate, toDate, limit = 50, page = 1 } = {}) {
    assertTenantContext(tenantContext);
    const where = {
      restaurantId: tenantContext.restaurantId,
      branchId,
      ...(employeeId ? { employeeId } : {}),
      ...(status ? { status } : {}),
      ...(fromDate || toDate
        ? {
            openedAt: {
              ...(fromDate ? { gte: new Date(fromDate) } : {}),
              ...(toDate ? { lte: new Date(toDate) } : {}),
            },
          }
        : {}),
    };

    const take = Math.min(Number(limit) || 50, 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    const [items, total] = await Promise.all([
      prisma.shift.findMany({
        where,
        include: {
          employee: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { openedAt: "desc" },
        skip,
        take,
      }),
      prisma.shift.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page: Math.max(Number(page) || 1, 1),
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    };
  }
}

export const shiftRepository = new ShiftRepository();
export default shiftRepository;
