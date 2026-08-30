import prisma from "../../lib/prisma.js";
import { BaseRepository, ACTOR_SUMMARY_SELECT, buildDateRangeFilter } from "../../shared/repositories/base.repository.js";

export class AuditLogRepository extends BaseRepository {

  async findAuditLogs(tenantContext, { page = 1, limit = 20, action, entityType, entityId, actorEmployeeId, branchId, from, to } = {}) {
    this.assertTenant(tenantContext);
    const { skip, take } = this.getPaginationOffset(page, limit);
    const dateFilter = buildDateRangeFilter(from, to);

    const where = {
      restaurantId: tenantContext.restaurantId,
      ...(action ? { action } : {}),
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
      ...(actorEmployeeId ? { actorEmployeeId } : {}),
      ...(branchId ? { branchId } : {}),
      ...(dateFilter ? { createdAt: dateFilter } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take,
        include: {
          actor: { select: ACTOR_SUMMARY_SELECT },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { items, total };
  }

  async findAuditLogById(tenantContext, id) {
    this.assertTenant(tenantContext);
    return prisma.auditLog.findFirst({
      where: { id, restaurantId: tenantContext.restaurantId },
      include: { actor: { select: ACTOR_SUMMARY_SELECT } },
    });
  }

  async createAuditLog(tenantContext, { branchId, actorEmployeeId, action, entityType, entityId, metadata, ipAddress }) {
    this.assertTenant(tenantContext);
    return prisma.auditLog.create({
      data: {
        restaurantId: tenantContext.restaurantId,
        branchId: branchId || null,
        actorEmployeeId: actorEmployeeId || null,
        action,
        entityType,
        entityId: entityId || null,
        metadata: metadata || undefined,
        ipAddress: ipAddress || null,
      },
    });
  }
}

export const auditLogRepository = new AuditLogRepository();
export default auditLogRepository;
