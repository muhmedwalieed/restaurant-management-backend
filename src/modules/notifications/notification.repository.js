import prisma from "../../lib/prisma.js";
import { BaseRepository } from "../../shared/repositories/base.repository.js";

export class NotificationRepository extends BaseRepository {

  async findNotifications(tenantContext, employeeId, { page = 1, limit = 20, unreadOnly, type } = {}) {
    this.assertTenant(tenantContext);
    const { skip, take } = this.getPaginationOffset(page, limit);
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
        take,
        orderBy: { createdAt: "desc" },
      }),
      prisma.notification.count({ where }),
    ]);

    return { items, total };
  }

  async countUnread(tenantContext, employeeId) {
    this.assertTenant(tenantContext);
    return prisma.notification.count({
      where: { restaurantId: tenantContext.restaurantId, targetEmployeeId: employeeId, isRead: false },
    });
  }

  async markRead(tenantContext, employeeId, notificationId) {
    this.assertTenant(tenantContext);
    const result = await prisma.notification.updateMany({
      where: { id: notificationId, restaurantId: tenantContext.restaurantId, targetEmployeeId: employeeId },
      data: { isRead: true, readAt: new Date() },
    });
    return result.count;
  }

  async markAllRead(tenantContext, employeeId) {
    this.assertTenant(tenantContext);
    const result = await prisma.notification.updateMany({
      where: { restaurantId: tenantContext.restaurantId, targetEmployeeId: employeeId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return result.count;
  }

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

  async createNotifications(tenantContext, rows) {
    this.assertTenant(tenantContext);
    if (!rows.length) return;
    await prisma.notification.createMany({
      data: rows.map((row) => ({
        restaurantId: tenantContext.restaurantId,
        branchId: row.branchId || null,
        targetEmployeeId: row.targetEmployeeId,
        type: row.type,
        title: row.title,
        body: row.body,
        referenceType: row.referenceType || null,
        referenceId: row.referenceId || null,
      })),
    });
  }

  async findPreference(tenantContext, employeeId) {
    this.assertTenant(tenantContext);
    return prisma.notificationPreference.findFirst({
      where: { restaurantId: tenantContext.restaurantId, employeeId },
    });
  }

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

  async findPreferencesForEmployees(tenantContext, employeeIds) {
    this.assertTenant(tenantContext);
    return prisma.notificationPreference.findMany({
      where: { restaurantId: tenantContext.restaurantId, employeeId: { in: employeeIds } },
    });
  }
}

export const notificationRepository = new NotificationRepository();
export default notificationRepository;
