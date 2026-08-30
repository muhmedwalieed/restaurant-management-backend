import { sendSuccess } from "../../shared/utils/response.js";
import tableSessionService from "./table-session.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { AuthenticationError } from "../../shared/errors/index.js";

export class TableSessionController {
  startSession = asyncHandler(async (req, res) => {
    const tableId = req.body?.tableId || req.params.tableId;
    const result = await tableSessionService.startSession(req.tenantContext, tableId);
    return sendSuccess(res, { statusCode: 201, message: "Table session started", data: result });
  });

  joinSession = asyncHandler(async (req, res) => {
    const { qrToken } = req.params;
    const body = req.body ?? {};
    const restaurantId = await tableSessionService.resolveRestaurantId(qrToken);
    const result = await tableSessionService.joinSession(restaurantId, qrToken, {
      name: body.name,
      pin: body.pin,
    });
    return sendSuccess(res, { message: "Joined session", data: result });
  });

  getSession = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (req.memberContext.sessionId !== id) {
      throw new AuthenticationError("Session token does not match requested session");
    }
    const result = await tableSessionService.getSession(req.memberContext.restaurantId, id);
    return sendSuccess(res, { data: result });
  });

  getSessionStaff = asyncHandler(async (req, res) => {
    const result = await tableSessionService.getStaffSession(req.tenantContext, req.params.id);
    return sendSuccess(res, { data: result });
  });

  addItem = asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const { restaurantId, sessionId, memberId } = req.memberContext;
    const result = await tableSessionService.addItem(restaurantId, sessionId, memberId, {
      productId: body.productId,
      quantity: body.quantity,
    });
    return sendSuccess(res, { data: result });
  });

  updateItem = asyncHandler(async (req, res) => {
    const { itemId } = req.params;
    const body = req.body ?? {};
    const { restaurantId, sessionId } = req.memberContext;
    const result = await tableSessionService.updateItem(restaurantId, sessionId, itemId, {
      quantity: body.quantity,
    });
    return sendSuccess(res, { data: result });
  });

  removeItem = asyncHandler(async (req, res) => {
    const { itemId } = req.params;
    const { restaurantId, sessionId } = req.memberContext;
    const result = await tableSessionService.removeItem(restaurantId, sessionId, itemId);
    return sendSuccess(res, { data: result });
  });

  updateItemStaff = asyncHandler(async (req, res) => {
    const { id, itemId } = req.params;
    const body = req.body ?? {};
    const result = await tableSessionService.updateItem(req.tenantContext.restaurantId, id, itemId, {
      quantity: body.quantity,
    });
    return sendSuccess(res, { data: result });
  });

  removeItemStaff = asyncHandler(async (req, res) => {
    const { id, itemId } = req.params;
    const result = await tableSessionService.removeItem(req.tenantContext.restaurantId, id, itemId);
    return sendSuccess(res, { data: result });
  });

  callWaiter = asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const { restaurantId, sessionId, memberId } = req.memberContext;
    const result = await tableSessionService.callWaiter(restaurantId, sessionId, body.tableId, {
      requesterName: body.requesterName,
      note: body.note,
      type: body.type,
      memberId,
    });
    return sendSuccess(res, { data: result });
  });

  submitDraft = asyncHandler(async (req, res) => {
    const { restaurantId, sessionId } = req.memberContext;
    const result = await tableSessionService.submitDraft(restaurantId, sessionId);
    return sendSuccess(res, { data: result });
  });

  confirmSession = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await tableSessionService.confirmSession(req.tenantContext, id);
    return sendSuccess(res, { message: "Order confirmed", data: result });
  });

  closeSession = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await tableSessionService.closeSession(req.tenantContext, id);
    return sendSuccess(res, { message: "Session closed", data: result });
  });

  regeneratePin = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await tableSessionService.regeneratePin(req.tenantContext, id);
    return sendSuccess(res, { message: "PIN regenerated", data: result });
  });

  rejectPendingOrder = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await tableSessionService.rejectPendingOrder(req.tenantContext, id);
    return sendSuccess(res, { message: "Order returned to customer", data: result });
  });

  acceptWaiterCall = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await tableSessionService.acceptWaiterCall(req.tenantContext, id);
    return sendSuccess(res, { message: "Waiter call accepted", data: result });
  });

  dismissWaiterCall = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await tableSessionService.dismissWaiterCall(req.tenantContext, id);
    return sendSuccess(res, { message: "Waiter call resolved", data: result });
  });

  listBranchSessions = asyncHandler(async (req, res) => {
    const branchId = req.tenantContext.branchId;
    const result = await tableSessionService.listBranchSessions(req.tenantContext, branchId);
    return sendSuccess(res, { data: result });
  });

  getActiveSessionForTable = asyncHandler(async (req, res) => {
    const result = await tableSessionService.getActiveSessionForTable(req.tenantContext, req.params.tableId);
    return sendSuccess(res, { data: result });
  });
}

export const tableSessionController = new TableSessionController();
export default tableSessionController;
