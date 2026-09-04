import { Router } from "express";
import whatsAppController from "./whatsapp.controller.js";
import automationController from "../whatsapp-automation/automation.controller.js";
import { verifyWhatsAppSignature } from "./whatsapp_webhook.middleware.js";
import {
  connectConnectionSchema,
  updateConnectionSchema,
  sendMessageSchema,
  listMessagesQuerySchema,
} from "./whatsapp.validation.js";
import { listConversationsQuerySchema } from "../whatsapp-automation/automation.validation.js";
import { webhookRateLimiter } from "../../shared/middleware/rate-limiters.js";
import { authenticate } from "../auth/authenticate.middleware.js";
import { authorize } from "../auth/authorize.middleware.js";
import { requireTenantContext } from "../../shared/middleware/tenant-context.js";
import { validate } from "../../shared/middleware/validate.js";

const router = Router();

const webhookPostHandler = [
  webhookRateLimiter,
  verifyWhatsAppSignature,
  (req, res, next) => {
    whatsAppController.handleWebhook(req, res, next);
  },
];

const webhookGetHandler = [
  webhookRateLimiter,
  (req, res, next) => {
    whatsAppController.handleVerification(req, res, next);
  },
];

router.post("/webhooks/whatsapp", ...webhookPostHandler);
router.get("/webhooks/whatsapp", ...webhookGetHandler);
router.post("/v1/webhooks/whatsapp", ...webhookPostHandler);
router.get("/v1/webhooks/whatsapp", ...webhookGetHandler);

const adminRouter = Router();
adminRouter.use(authenticate, requireTenantContext);

adminRouter.post(
  "/connection",
  authorize("whatsapp.manage"),
  validate(connectConnectionSchema),
  (req, res, next) => {
    whatsAppController.connectAccount(req, res, next);
  }
);

adminRouter.get(
  "/connection",
  authorize("whatsapp.view"),
  (req, res, next) => {
    whatsAppController.getConnection(req, res, next);
  }
);

adminRouter.patch(
  "/connection",
  authorize("whatsapp.manage"),
  validate(updateConnectionSchema),
  (req, res, next) => {
    whatsAppController.updateConnection(req, res, next);
  }
);

adminRouter.delete(
  "/connection",
  authorize("whatsapp.manage"),
  (req, res, next) => {
    whatsAppController.disconnectAccount(req, res, next);
  }
);

adminRouter.post(
  "/messages",
  authorize("whatsapp.manage"),
  validate(sendMessageSchema),
  (req, res, next) => {
    whatsAppController.sendMessage(req, res, next);
  }
);

adminRouter.get(
  "/messages",
  authorize("whatsapp.view"),
  validate(listMessagesQuerySchema),
  (req, res, next) => {
    whatsAppController.listMessages(req, res, next);
  }
);

adminRouter.get(
  "/messages/:id",
  authorize("whatsapp.view"),
  (req, res, next) => {
    whatsAppController.getMessageById(req, res, next);
  }
);

adminRouter.post(
  "/webhooks/retry",
  authorize("whatsapp.manage"),
  (req, res, next) => {
    whatsAppController.retryFailedWebhooks(req, res, next);
  }
);

adminRouter.get(
  "/conversations",
  authorize("whatsapp.view"),
  validate(listConversationsQuerySchema),
  (req, res, next) => {
    automationController.listConversations(req, res, next);
  }
);

adminRouter.get(
  "/conversations/:id",
  authorize("whatsapp.view"),
  (req, res, next) => {
    automationController.getConversationById(req, res, next);
  }
);

adminRouter.post(
  "/conversations/:id/handoff",
  authorize("whatsapp.manage"),
  (req, res, next) => {
    automationController.handoffConversation(req, res, next);
  }
);

adminRouter.post(
  "/conversations/:id/close",
  authorize("whatsapp.manage"),
  (req, res, next) => {
    automationController.closeConversation(req, res, next);
  }
);

router.use("/v1/whatsapp", adminRouter);

export default router;
