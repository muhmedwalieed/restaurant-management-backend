import notificationRepository from "./notification.repository.js";
import { broadcastToEmployee } from "../../lib/socket.js";
import { NotFoundError } from "../../shared/errors/index.js";
import { paginateResponse } from "../../shared/utils/pagination.js";

export class NotificationService {

  async listNotifications(tenantContext, { page = 1, limit = 20, unreadOnly, type } = {}) {
    const employeeId = this.selfId(tenantContext);
    const { items, total } = await notificationRepository.findNotifications(tenantContext, employeeId, {
      page,
      limit,
      unreadOnly,
      type,
    });
    return paginateResponse(items, total, page, limit);
  }

  async getUnreadCount(tenantContext) {
    const employeeId = this.selfId(tenantContext);
    const count = await notificationRepository.countUnread(tenantContext, employeeId);
    return { count };
  }

  async markRead(tenantContext, notificationId) {
    const employeeId = this.selfId(tenantContext);
    const count = await notificationRepository.markRead(tenantContext, employeeId, notificationId);
    if (count === 0) {
      throw new NotFoundError("Notification not found or access denied");
    }
    return { message: "Notification marked as read" };
  }

  async markAllRead(tenantContext) {
    const employeeId = this.selfId(tenantContext);
    const count = await notificationRepository.markAllRead(tenantContext, employeeId);
    return { message: "All notifications marked as read", updatedCount: count };
  }

  async getPreferences(tenantContext) {
    const employeeId = this.selfId(tenantContext);
    const pref = await notificationRepository.findPreference(tenantContext, employeeId);
    return { disabledTypes: Array.isArray(pref?.disabledTypes) ? pref.disabledTypes : [] };
  }

  async updatePreferences(tenantContext, { disabledTypes }) {
    const employeeId = this.selfId(tenantContext);
    const pref = await notificationRepository.upsertPreference(tenantContext, employeeId, disabledTypes || []);
    return { disabledTypes: Array.isArray(pref.disabledTypes) ? pref.disabledTypes : [] };
  }

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
    this.broadcast(notification);
    return notification;
  }

  async notifyBranch(restaurantId, branchId, { type, title, body, referenceType, referenceId }) {
    const tenantContext = { restaurantId };
    const employees = await notificationRepository.findBranchEmployees(tenantContext, branchId);
    if (employees.length === 0) return 0;

    const prefs = await notificationRepository.findPreferencesForEmployees(
      tenantContext,
      employees.map((e) => e.id)
    );
    const disabledByEmployee = new Map(prefs.map((p) => [p.employeeId, Array.isArray(p.disabledTypes) ? p.disabledTypes : []]));

    const rows = employees
      .filter((emp) => !(disabledByEmployee.get(emp.id) || []).includes(type))
      .map((emp) => ({
        targetEmployeeId: emp.id,
        branchId,
        type,
        title,
        body,
        referenceType,
        referenceId,
      }));

    if (rows.length === 0) return 0;

    await notificationRepository.createNotifications(tenantContext, rows);

    for (const row of rows) {
      this.broadcast({
        restaurantId,
        branchId: row.branchId,
        targetEmployeeId: row.targetEmployeeId,
        type: row.type,
        title: row.title,
        body: row.body,
        referenceType: row.referenceType,
        referenceId: row.referenceId,
      });
    }
    return rows.length;
  }

  broadcast(notification) {
    if (notification?.targetEmployeeId) {
      broadcastToEmployee(notification.targetEmployeeId, "notification.created", notification);
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
