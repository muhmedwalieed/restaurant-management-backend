import dashboardService from "./dashboard.service.js";
import { sendSuccess } from "../../shared/utils/response.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";

export class DashboardController {
  getSummary = asyncHandler(async (req, res) => {
    const data = await dashboardService.getSummary(req.tenantContext, req.query);
    return sendSuccess(res, { data });
  });

  getChannelStats = asyncHandler(async (req, res) => {
    const data = await dashboardService.getChannelStats(req.tenantContext, req.query);
    return sendSuccess(res, { data });
  });

  getOrderStatusStats = asyncHandler(async (req, res) => {
    const data = await dashboardService.getOrderStatusStats(req.tenantContext, req.query);
    return sendSuccess(res, { data });
  });

  getSalesTrend = asyncHandler(async (req, res) => {
    const data = await dashboardService.getSalesTrend(req.tenantContext, req.query);
    return sendSuccess(res, { data });
  });

  getEmployeePerformance = asyncHandler(async (req, res) => {
    const data = await dashboardService.getEmployeePerformance(req.tenantContext, req.query);
    return sendSuccess(res, { data });
  });

  getBranchComparison = asyncHandler(async (req, res) => {
    const data = await dashboardService.getBranchComparison(req.tenantContext, req.query);
    return sendSuccess(res, { data });
  });
}

export const dashboardController = new DashboardController();
export default dashboardController;
