import { Router } from "express";
import templateController from "./template.controller.js";
import {
  createTemplateSchema,
  deleteTemplateSchema,
  resetTemplateSchema,
  updateTemplatesSchema,
} from "./template.validation.js";
import { authenticate } from "../auth/authenticate.middleware.js";
import { authorize } from "../auth/authorize.middleware.js";
import { requireTenantContext } from "../../shared/middleware/tenant-context.js";
import { validate } from "../../shared/middleware/validate.js";

const router = Router();

router.use(authenticate, requireTenantContext);

router.get(
  "/",
  authorize("restaurants.manage", "whatsapp.manage", "whatsapp.view", "chats.view", "chats.reply"),
  templateController.getTemplates
);
router.post(
  "/",
  authorize("restaurants.manage", "whatsapp.manage"),
  validate(createTemplateSchema),
  templateController.createTemplate
);
router.patch(
  "/",
  authorize("restaurants.manage", "whatsapp.manage"),
  validate(updateTemplatesSchema),
  templateController.updateTemplates
);
router.delete(
  "/:key",
  authorize("restaurants.manage", "whatsapp.manage"),
  validate(deleteTemplateSchema),
  templateController.deleteTemplate
);
router.post(
  "/reset",
  authorize("restaurants.manage", "whatsapp.manage"),
  validate(resetTemplateSchema),
  templateController.resetTemplates
);

export default router;

