import { Router } from "express";
import rateLimit from "express-rate-limit";
import tableController from "./table.controller.js";
import {
  tableQuerySchema,
  createTableSchema,
  updateTableSchema,
  publicTableMenuParamsSchema,
} from "./table.validation.js";
import { authenticate } from "../auth/authenticate.middleware.js";
import { authorize } from "../auth/authorize.middleware.js";
import { requireTenantContext } from "../../shared/middleware/tenant-context.js";
import { validate } from "../../shared/middleware/validate.js";
import env from "../../config/env.js";

const router = Router();

// Public rate limiter for unauthenticated table QR scan endpoint
const publicTableRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === "test" ? 1000 : 60, // 60 requests per 15 minutes in production
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests, please try again after 15 minutes",
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ==================== PUBLIC TABLE MENU ENDPOINT (No auth required) ====================
router.get("/menu/table/:qrToken", publicTableRateLimiter, validate(publicTableMenuParamsSchema), (req, res, next) => {
  tableController.resolveTableMenu(req, res, next);
});

// ==================== AUTHENTICATED BRANCH TABLES PIPELINE ====================
// Scoped strictly to /branches/:branchId/tables so it doesn't intercept other /v1 routes
const branchTableRouter = Router({ mergeParams: true });
branchTableRouter.use(authenticate, requireTenantContext, authorize("tables.manage"));

branchTableRouter.get("/", validate(tableQuerySchema), (req, res, next) => {
  tableController.listTables(req, res, next);
});

branchTableRouter.post("/", validate(createTableSchema), (req, res, next) => {
  tableController.createTable(req, res, next);
});

branchTableRouter.get("/:id", (req, res, next) => {
  tableController.getTableById(req, res, next);
});

branchTableRouter.patch("/:id", validate(updateTableSchema), (req, res, next) => {
  tableController.updateTable(req, res, next);
});

branchTableRouter.delete("/:id", (req, res, next) => {
  tableController.deleteTable(req, res, next);
});

branchTableRouter.post("/:id/regenerate-qr", (req, res, next) => {
  tableController.regenerateQrToken(req, res, next);
});

router.use("/branches/:branchId/tables", branchTableRouter);

export default router;
