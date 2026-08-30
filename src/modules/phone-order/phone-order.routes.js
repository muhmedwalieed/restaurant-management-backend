import { Router } from "express";
import phoneOrderController from "./phone-order.controller.js";
import { phoneLookupSchema, createPhoneOrderSchema } from "./phone-order.validation.js";
import { authenticate } from "../auth/authenticate.middleware.js";
import { authorize } from "../auth/authorize.middleware.js";
import { requireTenantContext } from "../../shared/middleware/tenant-context.js";
import { requireBranchAccess } from "../../shared/middleware/require-branch-access.js";
import { validate } from "../../shared/middleware/validate.js";

const router = Router();

router.use(authenticate, requireTenantContext);

router.post("/lookup", authorize("orders.create"), validate(phoneLookupSchema), (req, res, next) => {
  phoneOrderController.lookup(req, res, next);
});

router.post("/branches/:branchId/orders", requireBranchAccess(), authorize("orders.create"), validate(createPhoneOrderSchema), (req, res, next) => {
  phoneOrderController.createPhoneOrder(req, res, next);
});

export default router;
