import prisma from "../../lib/prisma.js";
import { AuthenticationError } from "../../shared/errors/index.js";

export class NotificationRepository {
  /**
   * Lists notifications targeted at a specific employee (self-scoped).
   */
  async findNotifications(tenantContext, employeeId, { page = 1, limit = 20, unreadOnly, type } = {}) {
    this.assertTenant(tenantContext);
    const skip = (page - 1) * limit;
    const where = {
      restaurantId: tenantContext.restaurantId,
      targetEmployeeId: employeeId,
      ...(unreadOnly ? { isRead: false } : {}),
      ...(type ? { type } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.notification.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * Unread count for an employee.
   */
  async countUnread(tenantContext, employeeId) {
    this.assertTenant(tenantContext);
    return prisma.notification.count({
      where: { restaurantId: tenantContext.restaurantId, targetEmployeeId: employeeId, isRead: false },
    });
  }

  /**
   * Marks a single notification as read (ownership enforced via where).
   */
  async markRead(tenantContext, employeeId, notificationId) {
    this.assertTenant(tenantContext);
    const result = await prisma.notification.updateMany({
      where: { id: notificationId, restaurantId: tenantContext.restaurantId, targetEmployeeId: employeeId },
      data: { isRead: true, readAt: new Date() },
    });
    return result.count;
  }

  /**
   * Marks all notifications of an employee as read.
   */
  async markAllRead(tenantContext, employeeId) {
    this.assertTenant(tenantContext);
    const result = await prisma.notification.updateMany({
      where: { restaurantId: tenantContext.restaurantId, targetEmployeeId: employeeId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return result.count;
  }

  /**
   * Creates a notification row.
   */
  async createNotification(tenantContext, { targetEmployeeId, branchId, type, title, body, referenceType, referenceId }) {
    this.assertTenant(tenantContext);
    return prisma.notification.create({
      data: {
        restaurantId: tenantContext.restaurantId,
        branchId: branchId || null,
        targetEmployeeId,
        type,
        title,
        body,
        referenceType: referenceType || null,
        referenceId: referenceId || null,
      },
    });
  }

  /**
   * Finds the notification preference row for an employee.
   */
  async findPreference(tenantContext, employeeId) {
    this.assertTenant(tenantContext);
    return prisma.notificationPreference.findFirst({
      where: { restaurantId: tenantContext.restaurantId, employeeId },
    });
  }

  /**
   * Upserts the preference row.
   */
  async upsertPreference(tenantContext, employeeId, disabledTypes) {
    this.assertTenant(tenantContext);
    return prisma.notificationPreference.upsert({
      where: { employeeId },
      update: { disabledTypes, updatedAt: new Date() },
      create: {
        restaurantId: tenantContext.restaurantId,
        employeeId,
        disabledTypes,
      },
    });
  }

  /**
   * Active (non-deleted) employees in a branch — notification targets for order events.
   */
  async findBranchEmployees(tenantContext, branchId) {
    this.assertTenant(tenantContext);
    return prisma.employee.findMany({
      where: {
        restaurantId: tenantContext.restaurantId,
        branchId,
        status: "ACTIVE",
        deletedAt: null,
      },
      select: { id: true },
    });
  }

  /**
   * Preference rows for a set of employees (to honor disabled types).
   */
  async findPreferencesForEmployees(tenantContext, employeeIds) {
    this.assertTenant(tenantContext);
    return prisma.notificationPreference.findMany({
      where: { restaurantId: tenantContext.restaurantId, employeeId: { in: employeeIds } },
    });
  }

  assertTenant(tenantContext) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }
  }
}

export const notificationRepository = new NotificationRepository();
export default notificationRepository;