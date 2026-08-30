import dashboardRepository from "./dashboard.repository.js";
import branchRepository from "../branches/branch.repository.js";
import { NotFoundError } from "../../shared/errors/index.js";

const ACTIVE_ORDER_STATUSES = ["PENDING", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY"];

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfDaysAgo(days) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  return d.toISOString();
}

export class DashboardService {

  async resolveBranch(tenantContext, branchId) {
    if (!branchId) return null;
    const branch = await branchRepository.findBranchById(tenantContext, branchId);
    if (!branch) {
      throw new NotFoundError("Branch not found or access denied");
    }
    return branch;
  }

  async getSummary(tenantContext, { branchId, from, to }) {
    await this.resolveBranch(tenantContext, branchId);
    const filters = { branchId, from, to };

    const [totalOrders, activeOrders, revenue, paidRevenue, ordersToday, revenueToday, totalCustomers, occupiedTables, topProducts] =
      await Promise.all([
        dashboardRepository.countOrders(tenantContext, filters),
        dashboardRepository.countOrders(tenantContext, { ...filters, statuses: ACTIVE_ORDER_STATUSES }),
        dashboardRepository.aggregateOrderTotals(tenantContext, { ...filters, excludeCancelled: true }),
        dashboardRepository.aggregateOrderTotals(tenantContext, { ...filters, paymentStatus: "PAID" }),
        dashboardRepository.countOrders(tenantContext, { branchId, from: startOfToday() }),
        dashboardRepository.aggregateOrderTotals(tenantContext, {
          branchId,
          from: startOfToday(),
          excludeCancelled: true,
        }),
        dashboardRepository.countCustomers(tenantContext),
        dashboardRepository.countOccupiedTables(tenantContext, branchId),
        dashboardRepository.topProducts(tenantContext, filters, 5),
      ]);

    const nonCancelledCount = revenue.count;
    const averageOrderValue = nonCancelledCount > 0 ? revenue.total / nonCancelledCount : 0;

    return {
      totalOrders,
      activeOrders,
      revenue: revenue.total,
      paidRevenue: paidRevenue.total,
      averageOrderValue: Number(averageOrderValue.toFixed(2)),
      ordersToday: ordersToday,
      revenueToday: revenueToday.total,
      totalCustomers,
      occupiedTables,
      topProducts,
    };
  }

  async getChannelStats(tenantContext, { branchId, from, to }) {
    await this.resolveBranch(tenantContext, branchId);
    return dashboardRepository.groupOrdersBySource(tenantContext, { branchId, from, to });
  }

  async getOrderStatusStats(tenantContext, { branchId, from, to }) {
    await this.resolveBranch(tenantContext, branchId);
    const filters = { branchId, from, to };
    const [byStatus, byPayment] = await Promise.all([
      dashboardRepository.groupOrdersByStatus(tenantContext, filters),
      dashboardRepository.groupOrdersByPaymentStatus(tenantContext, filters),
    ]);
    return { byStatus, byPayment };
  }

  async getBranchComparison(tenantContext, { from, to }) {
    const { byBranch, paidByBranch, branches } = await dashboardRepository.branchComparison(tenantContext, { from, to });

    const revenueMap = new Map(byBranch.map((r) => [r.branchId, r]));
    const paidMap = new Map(paidByBranch.map((r) => [r.branchId, Number(r._sum.total || 0)]));

    return branches
      .map((b) => {
        const stats = revenueMap.get(b.id);
        const orders = stats?._count._all || 0;
        const revenue = Number(stats?._sum.total || 0);
        return {
          branchId: b.id,
          branchName: b.name,
          code: b.code,
          isMain: b.isMain,
          status: b.status,
          orders,
          revenue,
          paidRevenue: paidMap.get(b.id) || 0,
          averageOrderValue: orders > 0 ? Number((revenue / orders).toFixed(2)) : 0,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }

  async getSalesTrend(tenantContext, { branchId, from, to, days = 7 }) {
    await this.resolveBranch(tenantContext, branchId);

    const rangeFrom = from || startOfDaysAgo(Math.min(Number(days) || 7, 90));
    const rangeTo = to || new Date().toISOString();
    return dashboardRepository.findOrdersForTrend(tenantContext, {
      branchId,
      from: rangeFrom,
      to: rangeTo,
    });
  }

  async getEmployeePerformance(tenantContext, { branchId, from, to }) {
    await this.resolveBranch(tenantContext, branchId);
    const rangeFrom = from || startOfDaysAgo(30);
    const rangeTo = to || new Date().toISOString();
    return dashboardRepository.employeePerformance(tenantContext, {
      branchId,
      from: rangeFrom,
      to: rangeTo,
    });
  }
}

export const dashboardService = new DashboardService();
export default dashboardService;
