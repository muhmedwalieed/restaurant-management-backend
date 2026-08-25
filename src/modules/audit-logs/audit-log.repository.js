import prisma from "../../lib/prisma.js";
import { AuthenticationError } from "../../shared/errors/index.js";

export class AuditLogRepository {

  async findAuditLogs(tenantContext, { page = 1, limit = 20, action, entityType, entityId, actorEmployeeId, branchId, from, to } = {}) {
    this.assertTenant(tenantContext);
    const skip = (page - 1) * limit;
    const where = {
      restaurantId: tenantContext.restaurantId,
      ...(action ? { action } : {}),
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
      ...(actorEmployeeId ? { actorEmployeeId } : {}),
      ...(branchId ? { branchId } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        include: {
          actor: { select: { id: true, name: true, email: true } },
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
      include: { actor: { select: { id: true, name: true, email: true } } },
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

  assertTenant(tenantContext) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }
  }
}

export const auditLogRepository = new AuditLogRepository();
export default auditLogRepository;
