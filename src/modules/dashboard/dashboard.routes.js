import { Router } from "express";
import dashboardController from "./dashboard.controller.js";
import {
  summaryQuerySchema,
  channelStatsQuerySchema,
  orderStatusStatsQuerySchema,
  salesTrendQuerySchema,
  employeePerformanceQuerySchema,
} from "./dashboard.validation.js";
import { authenticate } from "../auth/authenticate.middleware.js";
import { authorize } from "../auth/authorize.middleware.js";
import { requireTenantContext } from "../../shared/middleware/tenant-context.js";
import { validate } from "../../shared/middleware/validate.js";

const router = Router();

router.use(authenticate, requireTenantContext);

router.get("/summary", authorize("dashboard.view"), validate(summaryQuerySchema), (req, res, next) => {
  dashboardController.getSummary(req, res, next);
});

router.get("/channel-stats", authorize("dashboard.view"), validate(channelStatsQuerySchema), (req, res, next) => {
  dashboardController.getChannelStats(req, res, next);
});

router.get("/order-status-stats", authorize("dashboard.view"), validate(orderStatusStatsQuerySchema), (req, res, next) => {
  dashboardController.getOrderStatusStats(req, res, next);
});

router.get("/sales-trend", authorize("dashboard.view"), validate(salesTrendQuerySchema), (req, res, next) => {
  dashboardController.getSalesTrend(req, res, next);
});

router.get("/employee-performance", authorize("dashboard.view"), validate(employeePerformanceQuerySchema), (req, res, next) => {
  dashboardController.getEmployeePerformance(req, res, next);
});

router.get("/branches-comparison", authorize("dashboard.view"), validate(employeePerformanceQuerySchema), (req, res, next) => {
  dashboardController.getBranchComparison(req, res, next);
});

export default router;
