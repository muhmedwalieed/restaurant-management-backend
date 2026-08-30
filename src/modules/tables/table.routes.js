import { Router } from "express";
import tableController from "./table.controller.js";
import {
  tableQuerySchema,
  createTableSchema,
  updateTableSchema,
  publicTableMenuParamsSchema,
} from "./table.validation.js";
import { publicTableRateLimiter } from "../../shared/middleware/rate-limiters.js";
import { authenticate } from "../auth/authenticate.middleware.js";
import { authorize, authorizeAny } from "../auth/authorize.middleware.js";
import { requireTenantContext } from "../../shared/middleware/tenant-context.js";
import { requireBranchAccess } from "../../shared/middleware/require-branch-access.js";
import { validate } from "../../shared/middleware/validate.js";

const router = Router();

router.get("/menu/table/:qrToken", publicTableRateLimiter, validate(publicTableMenuParamsSchema), (req, res, next) => {
  tableController.resolveTableMenu(req, res, next);
});

const branchTableRouter = Router({ mergeParams: true });
branchTableRouter.use(authenticate, requireTenantContext, requireBranchAccess());

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
