import auditLogRepository from "./audit-log.repository.js";
import { NotFoundError } from "../../shared/errors/index.js";

/**
 * Audit action constants (Module 18). Append-only: entries are created internally
 * by services (admin actions) and by the domain-event subscription (entity changes).
 */
export const AuditAction = Object.freeze({
  ORDER_CREATED: "ORDER_CREATED",
  ORDER_STATUS_CHANGED: "ORDER_STATUS_CHANGED",
  ORDER_PAID: "ORDER_PAID",
  ORDER_CANCELLED: "ORDER_CANCELLED",
  CHAT_ASSIGNED: "CHAT_ASSIGNED",
  EMPLOYEE_FORCE_LOGGED_OUT: "EMPLOYEE_FORCE_LOGGED_OUT",
  ROLE_CREATED: "ROLE_CREATED",
  ROLE_UPDATED: "ROLE_UPDATED",
  ROLE_DELETED: "ROLE_DELETED",
  COUPON_CREATED: "COUPON_CREATED",
  COUPON_UPDATED: "COUPON_UPDATED",
  COUPON_DELETED: "COUPON_DELETED",
});

export class AuditLogService {
  async listAuditLogs(tenantContext, filters) {
    const { items, total } = await auditLogRepository.findAuditLogs(tenantContext, filters);
    const totalPages = Math.ceil(total / filters.limit) || 1;
    return {
      items,
      pagination: { page: filters.page, limit: filters.limit, total, totalPages },
    };
  }

  async getAuditLogById(tenantContext, id) {
    const entry = await auditLogRepository.findAuditLogById(tenantContext, id);
    if (!entry) {
      throw new NotFoundError("Audit log entry not found or access denied");
    }
    return entry;
  }

  /**
   * Internal API used by services to record an admin/sensitive action.
   */
  async record(tenantContext, { branchId, actorEmployeeId, action, entityType, entityId, metadata, ipAddress }) {
    return auditLogRepository.createAuditLog(tenantContext, {
      branchId,
      actorEmployeeId,
      action,
      entityType,
      entityId,
      metadata,
      ipAddress,
    });
  }
}

export const auditLogService = new AuditLogService();
export default auditLogService;