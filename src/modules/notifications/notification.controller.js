import notificationService from "./notification.service.js";
import { sendSuccess } from "../../shared/utils/response.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";

export class NotificationController {
  list = asyncHandler(async (req, res) => {
    const { page, limit, unreadOnly, type } = req.query;
    const { items, pagination } = await notificationService.listNotifications(req.tenantContext, {
      page,
      limit,
      unreadOnly,
      type,
    });
    return sendSuccess(res, { data: items, pagination });
  });

  unreadCount = asyncHandler(async (req, res) => {
    const data = await notificationService.getUnreadCount(req.tenantContext);
    return sendSuccess(res, { data });
  });

  markRead = asyncHandler(async (req, res) => {
    const result = await notificationService.markRead(req.tenantContext, req.params.id);
    return sendSuccess(res, { message: result.message });
  });

  markAllRead = asyncHandler(async (req, res) => {
    const result = await notificationService.markAllRead(req.tenantContext);
    return sendSuccess(res, { message: result.message, data: { updatedCount: result.updatedCount } });
  });

  getPreferences = asyncHandler(async (req, res) => {
    const data = await notificationService.getPreferences(req.tenantContext);
    return sendSuccess(res, { data });
  });

  updatePreferences = asyncHandler(async (req, res) => {
    const data = await notificationService.updatePreferences(req.tenantContext, req.body);
    return sendSuccess(res, { data });
  });
}

export const notificationController = new NotificationController();
export default notificationController;
