import { Router } from "express";
import rateLimit from "express-rate-limit";
import whatsAppController from "./whatsapp.controller.js";
import { verifyWhatsAppSignature } from "./whatsapp_webhook.middleware.js";
import {
  connectConnectionSchema,
  updateConnectionSchema,
  sendMessageSchema,
  listMessagesQuerySchema,
} from "./whatsapp.validation.js";
import { authenticate } from "../auth/authenticate.middleware.js";
import { authorize } from "../auth/authorize.middleware.js";
import { requireTenantContext } from "../../shared/middleware/tenant-context.js";
import { validate } from "../../shared/middleware/validate.js";
import env from "../../config/env.js";

const router = Router();

// Rate Limiter for Public Webhook Endpoint
const webhookRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === "test" ? 1000 : 100,
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many webhook events, please try again later",
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ==================== PUBLIC WEBHOOK ENDPOINTS ====================
router.post(
  "/webhooks/whatsapp",
  webhookRateLimiter,
  verifyWhatsAppSignature,
  (req, res, next) => {
    whatsAppController.handleWebhook(req, res, next);
  }
);

router.get("/webhooks/whatsapp", (req, res, next) => {
  whatsAppController.handleVerification(req, res, next);
});

// ==================== AUTHENTICATED ADMIN ENDPOINTS ====================
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

router.use("/v1/whatsapp", adminRouter);

export default router;
