import { sendSuccess } from "../../shared/utils/response.js";
import tableSessionService from "./table-session.service.js";

export class TableSessionController {
  async startSession(req, res, next) {
    try {
      const tableId = req.body?.tableId || req.params.tableId;
      const result = await tableSessionService.startSession(req.tenantContext, tableId);
      return sendSuccess(res, { statusCode: 201, message: "Table session started", data: result });
    } catch (error) {
      next(error);
    }
  }

  async joinSession(req, res, next) {
    try {
      const { qrToken } = req.params;
      const body = req.body ?? {};
      const restaurantId = await tableSessionService.resolveRestaurantId(qrToken);
      const result = await tableSessionService.joinSession(restaurantId, qrToken, {
        name: body.name,
        pin: body.pin,
      });
      return sendSuccess(res, { message: "Joined session", data: result });
    } catch (error) {
      next(error);
    }
  }

  async getSession(req, res, next) {
    try {
      const { id } = req.params;
      const restaurantId = await tableSessionService.resolveRestaurantIdForSession(id);
      const result = await tableSessionService.getSession(restaurantId, id);
      return sendSuccess(res, { data: result });
    } catch (error) {
      next(error);
    }
  }

  async getSessionStaff(req, res, next) {
    try {
      const result = await tableSessionService.getStaffSession(req.tenantContext, req.params.id);
      return sendSuccess(res, { data: result });
    } catch (error) {
      next(error);
    }
  }

  async addItem(req, res, next) {
    try {
      const body = req.body ?? {};
      const { restaurantId, sessionId } = req.memberContext;
      const result = await tableSessionService.addItem(restaurantId, sessionId, req.memberContext.memberId, {
        productId: body.productId,
        quantity: body.quantity,
      });
      return sendSuccess(res, { data: result });
    } catch (error) {
      next(error);
    }
  }

  async updateItem(req, res, next) {
    try {
      const { itemId } = req.params;
      const body = req.body ?? {};
      const { restaurantId, sessionId } = req.memberContext;
      const result = await tableSessionService.updateItem(restaurantId, sessionId, itemId, {
        quantity: body.quantity,
      });
      return sendSuccess(res, { data: result });
    } catch (error) {
      next(error);
    }
  }

  async removeItem(req, res, next) {
    try {
      const { itemId } = req.params;
      const { restaurantId, sessionId } = req.memberContext;
      const result = await tableSessionService.removeItem(restaurantId, sessionId, itemId);
      return sendSuccess(res, { data: result });
    } catch (error) {
      next(error);
    }
  }

  async callWaiter(req, res, next) {
    try {
      const body = req.body ?? {};
      const { restaurantId, sessionId } = req.memberContext;
      const result = await tableSessionService.callWaiter(restaurantId, sessionId, body.tableId, {
        requesterName: body.requesterName,
        note: body.note,
      });
      return sendSuccess(res, { data: result });
    } catch (error) {
      next(error);
    }
  }

  async submitDraft(req, res, next) {
    try {
      const { restaurantId, sessionId } = req.memberContext;
      const result = await tableSessionService.submitDraft(restaurantId, sessionId);
      return sendSuccess(res, { data: result });
    } catch (error) {
      next(error);
    }
  }

  async confirmSession(req, res, next) {
    try {
      const { id } = req.params;
      const result = await tableSessionService.confirmSession(req.tenantContext, id);
      return sendSuccess(res, { message: "Order confirmed", data: result });
    } catch (error) {
      next(error);
    }
  }

  async closeSession(req, res, next) {
    try {
      const { id } = req.params;
      const result = await tableSessionService.closeSession(req.tenantContext, id);
      return sendSuccess(res, { message: "Session closed", data: result });
    } catch (error) {
      next(error);
    }
  }

  async regeneratePin(req, res, next) {
    try {
      const result = await tableSessionService.regeneratePin(req.tenantContext, req.params.id);
      return sendSuccess(res, { message: "PIN regenerated", data: result });
    } catch (error) {
      next(error);
    }
  }

  async rejectPendingOrder(req, res, next) {
    try {
      const result = await tableSessionService.rejectPendingOrder(req.tenantContext, req.params.id);
      return sendSuccess(res, { message: "Order returned to customer", data: result });
    } catch (error) {
      next(error);
    }
  }

  async listBranchSessions(req, res, next) {
    try {
      const branchId = req.tenantContext.branchId;
      const result = await tableSessionService.listBranchSessions(req.tenantContext, branchId);
      return sendSuccess(res, { data: result });
    } catch (error) {
      next(error);
    }
  }

  async getActiveSessionForTable(req, res, next) {
    try {
      const result = await tableSessionService.getActiveSessionForTable(req.tenantContext, req.params.tableId);
      return sendSuccess(res, { data: result });
    } catch (error) {
      next(error);
    }
  }
}

export const tableSessionController = new TableSessionController();
export default tableSessionController;
