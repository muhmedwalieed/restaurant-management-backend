import { Router } from "express";
import templateController from "./template.controller.js";
import { resetTemplateSchema, updateTemplatesSchema } from "./template.validation.js";
import { authenticate } from "../auth/authenticate.middleware.js";
import { authorize } from "../auth/authorize.middleware.js";
import { requireTenantContext } from "../../shared/middleware/tenant-context.js";
import { validate } from "../../shared/middleware/validate.js";

const router = Router();

router.use(authenticate, requireTenantContext);

router.get("/", authorize("restaurants.manage"), templateController.getTemplates);
router.patch("/", authorize("restaurants.manage"), validate(updateTemplatesSchema), templateController.updateTemplates);
router.post("/reset", authorize("restaurants.manage"), validate(resetTemplateSchema), templateController.resetTemplates);

export default router;
