import { Router } from "express";
import notificationController from "./notification.controller.js";
import { listNotificationsQuerySchema, preferencesSchema } from "./notification.validation.js";
import { authenticate } from "../auth/authenticate.middleware.js";
import { authorize } from "../auth/authorize.middleware.js";
import { requireTenantContext } from "../../shared/middleware/tenant-context.js";
import { validate } from "../../shared/middleware/validate.js";

const router = Router();

router.use(authenticate, requireTenantContext);

router.get("/", authorize("notifications.view"), validate(listNotificationsQuerySchema), (req, res, next) => {
  notificationController.list(req, res, next);
});

router.get("/unread-count", authorize("notifications.view"), (req, res, next) => {
  notificationController.unreadCount(req, res, next);
});

router.get("/preferences", authorize("notifications.view"), (req, res, next) => {
  notificationController.getPreferences(req, res, next);
});

router.put("/preferences", authorize("notifications.view"), validate(preferencesSchema), (req, res, next) => {
  notificationController.updatePreferences(req, res, next);
});

router.post("/read-all", authorize("notifications.view"), (req, res, next) => {
  notificationController.markAllRead(req, res, next);
});

router.patch("/:id/read", authorize("notifications.view"), (req, res, next) => {
  notificationController.markRead(req, res, next);
});

export default router;