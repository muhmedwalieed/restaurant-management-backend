import notificationRepository from "./notification.repository.js";
import { getSocketIo } from "../../lib/socket.js";
import { NotFoundError } from "../../shared/errors/index.js";
import logger from "../../config/logger.js";

export class NotificationService {
  /**
   * Lists the caller's own notifications (self-scoped by tenantContext.employeeId).
   */
  async listNotifications(tenantContext, { page = 1, limit = 20, unreadOnly, type } = {}) {
    const employeeId = this.selfId(tenantContext);
    const { items, total } = await notificationRepository.findNotifications(tenantContext, employeeId, {
      page,
      limit,
      unreadOnly,
      type,
    });
    const totalPages = Math.ceil(total / limit) || 1;
    return { items, pagination: { page, limit, total, totalPages } };
  }

  /**
   * Unread count for the caller.
   */
  async getUnreadCount(tenantContext) {
    const employeeId = this.selfId(tenantContext);
    const count = await notificationRepository.countUnread(tenantContext, employeeId);
    return { count };
  }

  /**
   * Marks one of the caller's notifications as read (IDOR-safe).
   */
  async markRead(tenantContext, notificationId) {
    const employeeId = this.selfId(tenantContext);
    const count = await notificationRepository.markRead(tenantContext, employeeId, notificationId);
    if (count === 0) {
      throw new NotFoundError("Notification not found or access denied");
    }
    return { message: "Notification marked as read" };
  }

  /**
   * Marks all of the caller's notifications as read.
   */
  async markAllRead(tenantContext) {
    const employeeId = this.selfId(tenantContext);
    const count = await notificationRepository.markAllRead(tenantContext, employeeId);
    return { message: "All notifications marked as read", updatedCount: count };
  }

  /**
   * Returns the caller's notification preferences (default: nothing disabled).
   */
  async getPreferences(tenantContext) {
    const employeeId = this.selfId(tenantContext);
    const pref = await notificationRepository.findPreference(tenantContext, employeeId);
    return { disabledTypes: Array.isArray(pref?.disabledTypes) ? pref.disabledTypes : [] };
  }

  /**
   * Updates the caller's notification preferences.
   */
  async updatePreferences(tenantContext, { disabledTypes }) {
    const employeeId = this.selfId(tenantContext);
    const pref = await notificationRepository.upsertPreference(tenantContext, employeeId, disabledTypes || []);
    return { disabledTypes: Array.isArray(pref.disabledTypes) ? pref.disabledTypes : [] };
  }

  /**
   * Creates a notification for a single target employee, honoring their preferences.
   * Used for directed alerts (e.g. chat assigned to a specific agent).
   */
  async createForEmployee(tenantContext, { targetEmployeeId, branchId, type, title, body, referenceType, referenceId }) {
    const pref = await notificationRepository.findPreference(tenantContext, targetEmployeeId);
    const disabled = Array.isArray(pref?.disabledTypes) ? pref.disabledTypes : [];
    if (disabled.includes(type)) {
      return null;
    }

    const notification = await notificationRepository.createNotification(tenantContext, {
      targetEmployeeId,
      branchId,
      type,
      title,
      body,
      referenceType,
      referenceId,
    });
    this.broadcast(tenantContext.restaurantId, notification);
    return notification;
  }

  /**
   * Creates notifications for every active employee in a branch (order alerts),
   * honoring each employee's disabled types.
   */
  async notifyBranch(restaurantId, branchId, { type, title, body, referenceType, referenceId }) {
    const tenantContext = { restaurantId };
    const employees = await notificationRepository.findBranchEmployees(tenantContext, branchId);
    if (employees.length === 0) return 0;

    const prefs = await notificationRepository.findPreferencesForEmployees(
      tenantContext,
      employees.map((e) => e.id)
    );
    const disabledByEmployee = new Map(prefs.map((p) => [p.employeeId, Array.isArray(p.disabledTypes) ? p.disabledTypes : []]));

    let created = 0;
    for (const emp of employees) {
      if ((disabledByEmployee.get(emp.id) || []).includes(type)) continue;
      const notification = await notificationRepository.createNotification(tenantContext, {
        targetEmployeeId: emp.id,
        branchId,
        type,
        title,
        body,
        referenceType,
        referenceId,
      });
      this.broadcast(restaurantId, notification);
      created += 1;
    }
    return created;
  }

  /**
   * Real-time push (Section 29): broadcast to the tenant room when Socket.IO is running.
   */
  broadcast(restaurantId, notification) {
    try {
      getSocketIo()?.to(`restaurant:${restaurantId}`).emit("notification.created", notification);
    } catch (err) {
      logger.warn({ err: err.message }, "Socket broadcast failed for notification");
    }
  }

  selfId(tenantContext) {
    if (!tenantContext?.employeeId) {
      throw new NotFoundError("Employee identity required for notifications");
    }
    return tenantContext.employeeId;
  }
}

export const notificationService = new NotificationService();
export default notificationService;