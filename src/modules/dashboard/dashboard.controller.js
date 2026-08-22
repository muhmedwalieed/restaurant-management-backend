import dashboardService from "./dashboard.service.js";
import { sendSuccess } from "../../shared/utils/response.js";

export class DashboardController {
  async getSummary(req, res, next) {
    try {
      const query = req.validated?.query ?? req.query ?? {};
      const data = await dashboardService.getSummary(req.tenantContext, query);
      return sendSuccess(res, { data });
    } catch (error) {
      next(error);
    }
  }

  async getChannelStats(req, res, next) {
    try {
      const query = req.validated?.query ?? req.query ?? {};
      const data = await dashboardService.getChannelStats(req.tenantContext, query);
      return sendSuccess(res, { data });
    } catch (error) {
      next(error);
    }
  }

  async getOrderStatusStats(req, res, next) {
    try {
      const query = req.validated?.query ?? req.query ?? {};
      const data = await dashboardService.getOrderStatusStats(req.tenantContext, query);
      return sendSuccess(res, { data });
    } catch (error) {
      next(error);
    }
  }

  async getSalesTrend(req, res, next) {
    try {
      const query = req.validated?.query ?? req.query ?? {};
      const data = await dashboardService.getSalesTrend(req.tenantContext, query);
      return sendSuccess(res, { data });
    } catch (error) {
      next(error);
    }
  }

  async getEmployeePerformance(req, res, next) {
    try {
      const query = req.validated?.query ?? req.query ?? {};
      const data = await dashboardService.getEmployeePerformance(req.tenantContext, query);
      return sendSuccess(res, { data });
    } catch (error) {
      next(error);
    }
  }
}

export const dashboardController = new DashboardController();
export default dashboardController;