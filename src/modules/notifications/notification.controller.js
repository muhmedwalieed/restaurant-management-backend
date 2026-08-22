import notificationService from "./notification.service.js";
import { sendSuccess } from "../../shared/utils/response.js";

export class NotificationController {
  async list(req, res, next) {
    try {
      const query = req.validated?.query ?? req.query ?? {};
      const page = query.page ? parseInt(query.page, 10) : 1;
      const limit = query.limit ? Math.min(parseInt(query.limit, 10), 100) : 20;
      const { items, pagination } = await notificationService.listNotifications(req.tenantContext, {
        page,
        limit,
        unreadOnly: query.unreadOnly,
        type: query.type,
      });
      return sendSuccess(res, { data: items, pagination });
    } catch (error) {
      next(error);
    }
  }

  async unreadCount(req, res, next) {
    try {
      const data = await notificationService.getUnreadCount(req.tenantContext);
      return sendSuccess(res, { data });
    } catch (error) {
      next(error);
    }
  }

  async markRead(req, res, next) {
    try {
      const result = await notificationService.markRead(req.tenantContext, req.params.id);
      return sendSuccess(res, { message: result.message });
    } catch (error) {
      next(error);
    }
  }

  async markAllRead(req, res, next) {
    try {
      const result = await notificationService.markAllRead(req.tenantContext);
      return sendSuccess(res, { message: result.message, data: { updatedCount: result.updatedCount } });
    } catch (error) {
      next(error);
    }
  }

  async getPreferences(req, res, next) {
    try {
      const data = await notificationService.getPreferences(req.tenantContext);
      return sendSuccess(res, { data });
    } catch (error) {
      next(error);
    }
  }

  async updatePreferences(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body ?? {};
      const data = await notificationService.updatePreferences(req.tenantContext, body);
      return sendSuccess(res, { data });
    } catch (error) {
      next(error);
    }
  }
}

export const notificationController = new NotificationController();
export default notificationController;