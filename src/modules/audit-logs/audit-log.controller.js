import auditLogService from "./audit-log.service.js";
import { sendSuccess } from "../../shared/utils/response.js";

export class AuditLogController {
  async list(req, res, next) {
    try {
      const query = req.validated?.query ?? req.query ?? {};
      const page = query.page ? parseInt(query.page, 10) : 1;
      const limit = query.limit ? Math.min(parseInt(query.limit, 10), 100) : 20;
      const { items, pagination } = await auditLogService.listAuditLogs(req.tenantContext, {
        page,
        limit,
        action: query.action,
        entityType: query.entityType,
        entityId: query.entityId,
        actorEmployeeId: query.actorEmployeeId,
        branchId: query.branchId,
        from: query.from,
        to: query.to,
      });
      return sendSuccess(res, { data: items, pagination });
    } catch (error) {
      next(error);
    }
  }

  async getById(req, res, next) {
    try {
      const entry = await auditLogService.getAuditLogById(req.tenantContext, req.params.id);
      return sendSuccess(res, { data: entry });
    } catch (error) {
      next(error);
    }
  }
}

export const auditLogController = new AuditLogController();
export default auditLogController;