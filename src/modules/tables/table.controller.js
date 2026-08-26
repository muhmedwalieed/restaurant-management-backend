import tableService from "./table.service.js";
import { sendSuccess } from "../../shared/utils/response.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";

export class TableController {
  listTables = asyncHandler(async (req, res) => {
    const { page, limit, status } = req.query;
    const { items, pagination } = await tableService.listTables(req.tenantContext, req.params.branchId, {
      page,
      limit,
      status,
    });
    return sendSuccess(res, { data: items, pagination });
  });

  getTableById = asyncHandler(async (req, res) => {
    const table = await tableService.getTableById(req.tenantContext, req.params.branchId, req.params.id);
    return sendSuccess(res, { data: table });
  });

  createTable = asyncHandler(async (req, res) => {
    const table = await tableService.createTable(req.tenantContext, req.params.branchId, req.body);
    return sendSuccess(res, {
      statusCode: 201,
      message: "Table created successfully",
      data: table,
    });
  });

  updateTable = asyncHandler(async (req, res) => {
    const table = await tableService.updateTable(req.tenantContext, req.params.branchId, req.params.id, req.body);
    return sendSuccess(res, {
      message: "Table updated successfully",
      data: table,
    });
  });

  deleteTable = asyncHandler(async (req, res) => {
    const result = await tableService.deleteTable(req.tenantContext, req.params.branchId, req.params.id);
    return sendSuccess(res, { message: result.message });
  });

  regenerateQrToken = asyncHandler(async (req, res) => {
    const result = await tableService.regenerateQrToken(req.tenantContext, req.params.branchId, req.params.id);
    return sendSuccess(res, {
      message: "QR code regenerated successfully",
      data: result,
    });
  });

  resolveTableMenu = asyncHandler(async (req, res) => {
    const data = await tableService.resolveTableMenu(req.params.qrToken);
    return sendSuccess(res, { data });
  });
}

export const tableController = new TableController();
export default tableController;
