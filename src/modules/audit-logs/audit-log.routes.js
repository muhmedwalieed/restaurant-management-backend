import { Router } from "express";
import auditLogController from "./audit-log.controller.js";
import { listAuditLogsQuerySchema } from "./audit-log.validation.js";
import { authenticate } from "../auth/authenticate.middleware.js";
import { authorize } from "../auth/authorize.middleware.js";
import { requireTenantContext } from "../../shared/middleware/tenant-context.js";
import { validate } from "../../shared/middleware/validate.js";

const router = Router();

router.use(authenticate, requireTenantContext);

router.get("/", authorize("audit.view"), validate(listAuditLogsQuerySchema), (req, res, next) => {
  auditLogController.list(req, res, next);
});

router.get("/:id", authorize("audit.view"), (req, res, next) => {
  auditLogController.getById(req, res, next);
});

export default router;
