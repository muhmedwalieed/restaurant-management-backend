import tableService from "./table.service.js";
import { sendSuccess } from "../../shared/utils/response.js";

export class TableController {
  async listTables(req, res, next) {
    try {
      const query = req.validated?.query ?? req.query ?? {};
      const page = query.page ? parseInt(query.page, 10) : 1;
      const limit = query.limit ? Math.min(parseInt(query.limit, 10), 100) : 20;
      const status = query.status;

      const { items, pagination } = await tableService.listTables(req.tenantContext, req.params.branchId, {
        page,
        limit,
        status,
      });

      return sendSuccess(res, {
        data: items,
        pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  async getTableById(req, res, next) {
    try {
      const table = await tableService.getTableById(req.tenantContext, req.params.branchId, req.params.id);
      return sendSuccess(res, {
        data: table,
      });
    } catch (error) {
      next(error);
    }
  }

  async createTable(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body ?? {};
      const table = await tableService.createTable(req.tenantContext, req.params.branchId, body);
      return sendSuccess(res, {
        statusCode: 201,
        message: "Table created successfully",
        data: table,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateTable(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body ?? {};
      const table = await tableService.updateTable(req.tenantContext, req.params.branchId, req.params.id, body);
      return sendSuccess(res, {
        message: "Table updated successfully",
        data: table,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteTable(req, res, next) {
    try {
      const result = await tableService.deleteTable(req.tenantContext, req.params.branchId, req.params.id);
      return sendSuccess(res, {
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  async regenerateQrToken(req, res, next) {
    try {
      const result = await tableService.regenerateQrToken(req.tenantContext, req.params.branchId, req.params.id);
      return sendSuccess(res, {
        message: "QR code regenerated successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async resolveTableMenu(req, res, next) {
    try {
      const qrToken = req.params.qrToken;
      const data = await tableService.resolveTableMenu(qrToken);
      return sendSuccess(res, {
        data,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const tableController = new TableController();
export default tableController;
