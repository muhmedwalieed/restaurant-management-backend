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
import { authorize, authorizeAny } from "../auth/authorize.middleware.js";
import { requireTenantContext } from "../../shared/middleware/tenant-context.js";
import { validate } from "../../shared/middleware/validate.js";
import env from "../../config/env.js";

const router = Router();

const publicTableRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === "test" ? 1000 : 60,
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

router.get("/menu/table/:qrToken", publicTableRateLimiter, validate(publicTableMenuParamsSchema), (req, res, next) => {
  tableController.resolveTableMenu(req, res, next);
});

const branchTableRouter = Router({ mergeParams: true });
branchTableRouter.use(authenticate, requireTenantContext);

branchTableRouter.get("/", authorizeAny("tables.view", "tables.manage"), validate(tableQuerySchema), (req, res, next) => {
  tableController.listTables(req, res, next);
});

branchTableRouter.post("/", authorize("tables.manage"), validate(createTableSchema), (req, res, next) => {
  tableController.createTable(req, res, next);
});

branchTableRouter.get("/:id", authorizeAny("tables.view", "tables.manage"), (req, res, next) => {
  tableController.getTableById(req, res, next);
});

branchTableRouter.patch("/:id", authorize("tables.manage"), validate(updateTableSchema), (req, res, next) => {
  tableController.updateTable(req, res, next);
});

branchTableRouter.delete("/:id", authorize("tables.manage"), (req, res, next) => {
  tableController.deleteTable(req, res, next);
});

branchTableRouter.post("/:id/regenerate-qr", authorize("tables.manage"), (req, res, next) => {
  tableController.regenerateQrToken(req, res, next);
});

router.use("/branches/:branchId/tables", branchTableRouter);

export default router;
