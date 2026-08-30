import prisma from "../../lib/prisma.js";
import { BaseRepository, buildDateRangeFilter } from "../../shared/repositories/base.repository.js";

function buildOrderWhere(tenantContext, { branchId, from, to, excludeCancelled = false, statuses, paymentStatus } = {}) {
  const dateFilter = buildDateRangeFilter(from, to);
  const where = {
    restaurantId: tenantContext.restaurantId,
    ...(branchId ? { branchId } : {}),
    ...(statuses ? { status: { in: statuses } } : {}),
    ...(paymentStatus ? { paymentStatus } : {}),
    ...(excludeCancelled ? { status: { not: "CANCELLED" } } : {}),
    ...(dateFilter ? { createdAt: dateFilter } : {}),
  };

  return where;
}

export class DashboardRepository extends BaseRepository {
  async countOrders(tenantContext, filters) {
    this.assertTenant(tenantContext);
    return prisma.order.count({ where: buildOrderWhere(tenantContext, filters) });
  }

  async aggregateOrderTotals(tenantContext, filters) {
    this.assertTenant(tenantContext);
    const result = await prisma.order.aggregate({
      where: buildOrderWhere(tenantContext, filters),
      _sum: { total: true },
      _count: { _all: true },
    });
    return {
      count: result._count._all,
      total: Number(result._sum.total || 0),
    };
  }

  async countCustomers(tenantContext) {
    this.assertTenant(tenantContext);
    return prisma.customer.count({
      where: { restaurantId: tenantContext.restaurantId, deletedAt: null },
    });
  }

  async countOccupiedTables(tenantContext, branchId) {
    this.assertTenant(tenantContext);
    return prisma.restaurantTable.count({
      where: {
        restaurantId: tenantContext.restaurantId,
        ...(branchId ? { branchId } : {}),
        status: "OCCUPIED",
        deletedAt: null,
      },
    });
  }

  async groupOrdersBySource(tenantContext, filters) {
    this.assertTenant(tenantContext);
    const rows = await prisma.order.groupBy({
      by: ["source"],
      where: buildOrderWhere(tenantContext, { ...filters, excludeCancelled: true }),
      _count: { _all: true },
      _sum: { total: true },
      orderBy: { _sum: { total: "desc" } },
    });
    return rows.map((r) => ({
      source: r.source,
      orders: r._count._all,
      revenue: Number(r._sum.total || 0),
    }));
  }

  async groupOrdersByStatus(tenantContext, filters) {
    this.assertTenant(tenantContext);
    const rows = await prisma.order.groupBy({
      by: ["status"],
      where: buildOrderWhere(tenantContext, filters),
      _count: { _all: true },
    });
    return rows.map((r) => ({ status: r.status, orders: r._count._all }));
  }

  async groupOrdersByPaymentStatus(tenantContext, filters) {
    this.assertTenant(tenantContext);
    const rows = await prisma.order.groupBy({
      by: ["paymentStatus"],
      where: buildOrderWhere(tenantContext, filters),
      _count: { _all: true },
    });
    return rows.map((r) => ({ paymentStatus: r.paymentStatus, orders: r._count._all }));
  }

  async branchComparison(tenantContext, { from, to } = {}) {
    this.assertTenant(tenantContext);
    const dateFilter = buildDateRangeFilter(from, to);
    const where = {
      restaurantId: tenantContext.restaurantId,
      status: { not: "CANCELLED" },
      ...(dateFilter ? { createdAt: dateFilter } : {}),
    };

    const [byBranch, paidByBranch, branches] = await Promise.all([
      prisma.order.groupBy({
        by: ["branchId"],
        where,
        _count: { _all: true },
        _sum: { total: true },
      }),
      prisma.order.groupBy({
        by: ["branchId"],
        where: { ...where, paymentStatus: "PAID" },
        _sum: { total: true },
      }),
      prisma.branch.findMany({
        where: { restaurantId: tenantContext.restaurantId },
        select: { id: true, name: true, code: true, isMain: true, status: true },
      }),
    ]);

    return { byBranch, paidByBranch, branches };
  }

  async findOrdersForTrend(tenantContext, filters) {
    this.assertTenant(tenantContext);
    const restaurantId = tenantContext.restaurantId;
    const from = filters.from ? new Date(filters.from) : null;
    const to = filters.to ? new Date(filters.to) : null;
    const branchId = filters.branchId || null;

    const rows = await prisma.$queryRaw`
      SELECT
        (DATE_TRUNC('day', o.created_at AT TIME ZONE 'UTC'))::date AS day,
        COUNT(*)::int AS orders,
        COALESCE(SUM(o.total), 0)::float AS revenue
      FROM orders o
      WHERE o.restaurant_id = ${restaurantId}
        AND o.status <> 'CANCELLED'
        AND (${branchId}::text IS NULL OR o.branch_id = ${branchId})
        AND (${from}::timestamptz IS NULL OR o.created_at >= ${from})
        AND (${to}::timestamptz IS NULL OR o.created_at <= ${to})
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    return rows.map((r) => ({
      date: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10),
      orders: Number(r.orders),
      revenue: Number(Number(r.revenue).toFixed(2)),
    }));
  }

  async topProducts(tenantContext, filters, take = 5) {
    this.assertTenant(tenantContext);
    const dateFilter = buildDateRangeFilter(filters.from, filters.to);
    const orderFilter = {
      status: { not: "CANCELLED" },
      ...(filters.branchId ? { branchId: filters.branchId } : {}),
      ...(dateFilter ? { createdAt: dateFilter } : {}),
    };
    const rows = await prisma.orderItem.groupBy({
      by: ["productName"],
      where: {
        restaurantId: tenantContext.restaurantId,
        order: orderFilter,
      },
      _sum: { quantity: true },
      _count: { _all: true },
      orderBy: { _sum: { quantity: "desc" } },
      take,
    });
    return rows.map((r) => ({
      productName: r.productName,
      quantitySold: Number(r._sum.quantity || 0),
      orderCount: r._count._all,
    }));
  }

  async employeePerformance(tenantContext, filters) {
    this.assertTenant(tenantContext);
    const dateFilter = buildDateRangeFilter(filters.from, filters.to);

    const orderWhere = buildOrderWhere(tenantContext, filters);
    const paidOrders = await prisma.order.findMany({
      where: { ...orderWhere, paidByEmployeeId: { not: null } },
      select: { paidByEmployeeId: true, total: true },
    });

    const historyWhere = {
      restaurantId: tenantContext.restaurantId,
      changedById: { not: null },
      ...(filters.branchId
        ? { order: { branchId: filters.branchId } }
        : {}),
      ...(dateFilter
        ? { createdAt: dateFilter }
        : {}),
    };
    const actions = await prisma.orderStatusHistory.findMany({
      where: historyWhere,
      select: { changedById: true, orderId: true },
    });

    const employees = await prisma.employee.findMany({
      where: { restaurantId: tenantContext.restaurantId, deletedAt: null },
      select: { id: true, name: true },
    });
    const employeeMap = new Map(employees.map((e) => [e.id, e.name]));

    const collectedByEmployee = new Map();
    for (const o of paidOrders) {
      const entry = collectedByEmployee.get(o.paidByEmployeeId) || { ordersCollected: 0, revenueCollected: 0 };
      entry.ordersCollected += 1;
      entry.revenueCollected += Number(o.total);
      collectedByEmployee.set(o.paidByEmployeeId, entry);
    }

    const actionsByEmployee = new Map();
    const distinctOrdersByEmployee = new Map();
    for (const a of actions) {
      actionsByEmployee.set(a.changedById, (actionsByEmployee.get(a.changedById) || 0) + 1);
      const set = distinctOrdersByEmployee.get(a.changedById) || new Set();
      set.add(a.orderId);
      distinctOrdersByEmployee.set(a.changedById, set);
    }

    const employeeIds = new Set([...collectedByEmployee.keys(), ...actionsByEmployee.keys()]);
    return [...employeeIds].map((id) => ({
      employeeId: id,
      employeeName: employeeMap.get(id) || "Unknown",
      ordersCollected: collectedByEmployee.get(id)?.ordersCollected || 0,
      revenueCollected: collectedByEmployee.get(id)?.revenueCollected || 0,
      actionsPerformed: actionsByEmployee.get(id) || 0,
      distinctOrdersHandled: distinctOrdersByEmployee.get(id)?.size || 0,
    }));
  }
}

export const dashboardRepository = new DashboardRepository();
export default dashboardRepository;
