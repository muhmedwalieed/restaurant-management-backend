import auditLogService from "./audit-log.service.js";
import { sendSuccess } from "../../shared/utils/response.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";

export class AuditLogController {
  list = asyncHandler(async (req, res) => {
    const { page, limit, action, entityType, entityId, actorEmployeeId, branchId, from, to } = req.query;
    const { items, pagination } = await auditLogService.listAuditLogs(req.tenantContext, {
      page,
      limit,
      action,
      entityType,
      entityId,
      actorEmployeeId,
      branchId,
      from,
      to,
    });
    return sendSuccess(res, { data: items, pagination });
  });

  getById = asyncHandler(async (req, res) => {
    const entry = await auditLogService.getAuditLogById(req.tenantContext, req.params.id);
    return sendSuccess(res, { data: entry });
  });
}

export const auditLogController = new AuditLogController();
export default auditLogController;
