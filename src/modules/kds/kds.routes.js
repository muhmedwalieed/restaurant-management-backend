import { Router } from "express";
import kdsController from "./kds.controller.js";
import { kdsQuerySchema, kdsStatusUpdateSchema } from "./kds.validation.js";
import { authenticate } from "../auth/authenticate.middleware.js";
import { authorize } from "../auth/authorize.middleware.js";
import { requireTenantContext } from "../../shared/middleware/tenant-context.js";
import { validate } from "../../shared/middleware/validate.js";

const router = Router({ mergeParams: true });

router.use(authenticate, requireTenantContext);

router.get("/", authorize("orders.view"), validate(kdsQuerySchema), (req, res, next) => {
  kdsController.getActiveKitchenOrders(req, res, next);
});

router.patch("/:id/status", authorize("orders.update"), validate(kdsStatusUpdateSchema), (req, res, next) => {
  kdsController.updateKitchenOrderStatus(req, res, next);
});

export default router;
