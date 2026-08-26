import orderService from "./order.service.js";
import { sendSuccess } from "../../shared/utils/response.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";

export class OrderController {
  listOrders = asyncHandler(async (req, res) => {
    const { page, limit, status, type, source, tableId } = req.query;
    const { items, pagination } = await orderService.listOrders(req.tenantContext, req.params.branchId, {
      page,
      limit,
      status,
      type,
      source,
      tableId,
    });
    return sendSuccess(res, { data: items, pagination });
  });

  listAllOrders = asyncHandler(async (req, res) => {
    const { page, limit, status, type, source, branchId, tableId } = req.query;
    const { items, pagination } = await orderService.listAllOrders(req.tenantContext, {
      page,
      limit,
      status,
      type,
      source,
      branchId,
      tableId,
    });
    return sendSuccess(res, { data: items, pagination });
  });

  getOrderById = asyncHandler(async (req, res) => {
    const order = await orderService.getOrderById(req.tenantContext, req.params.branchId, req.params.id);
    return sendSuccess(res, { data: order });
  });

  createOrder = asyncHandler(async (req, res) => {
    const idempotencyKey = req.headers["idempotency-key"] || req.headers["x-idempotency-key"] || null;
    const result = await orderService.createOrder(req.tenantContext, req.params.branchId, req.body, idempotencyKey);

    if (result.isCached) {
      return res.status(result.statusCode).json(result.data);
    }

    return sendSuccess(res, {
      statusCode: 201,
      message: "Order created successfully",
      data: result.data,
    });
  });

  updateOrderStatus = asyncHandler(async (req, res) => {
    const { newStatus, expectedVersion, reason } = req.body;
    const updatedOrder = await orderService.updateOrderStatus(
      req.tenantContext,
      req.params.branchId,
      req.params.id,
      {
        newStatus,
        expectedVersion,
        reason,
      }
    );

    return sendSuccess(res, {
      message: `Order status updated to '${updatedOrder.status}'`,
      data: updatedOrder,
    });
  });

  cancelOrder = asyncHandler(async (req, res) => {
    const { expectedVersion, reason } = req.body;
    const cancelledOrder = await orderService.cancelOrder(
      req.tenantContext,
      req.params.branchId,
      req.params.id,
      {
        expectedVersion,
        reason,
      }
    );

    return sendSuccess(res, {
      message: "Order cancelled successfully",
      data: cancelledOrder,
    });
  });

  getOrderHistory = asyncHandler(async (req, res) => {
    const history = await orderService.getOrderHistory(req.tenantContext, req.params.branchId, req.params.id);
    return sendSuccess(res, { data: history });
  });

  createPublicOrder = asyncHandler(async (req, res) => {
    const idempotencyKey = req.headers["idempotency-key"] || req.headers["x-idempotency-key"] || null;
    const result = await orderService.createPublicOrder(req.body, idempotencyKey);

    if (result.isCached) {
      return res.status(result.statusCode).json(result.data);
    }

    return sendSuccess(res, {
      statusCode: 201,
      message: "Order submitted successfully",
      data: result.data,
    });
  });

  trackOrder = asyncHandler(async (req, res) => {
    const order = await orderService.trackOrder(req.query);
    return sendSuccess(res, { data: order });
  });

  createPosOrder = asyncHandler(async (req, res) => {
    const idempotencyKey = req.headers["idempotency-key"] || req.headers["x-idempotency-key"] || null;
    const result = await orderService.createPosOrder(req.tenantContext, req.params.branchId, req.body, idempotencyKey);

    if (result.isCached) {
      return res.status(result.statusCode).json(result.data);
    }

    return sendSuccess(res, {
      statusCode: 201,
      message: "POS order created successfully",
      data: result.data,
    });
  });

  processOrderPayment = asyncHandler(async (req, res) => {
    const paidOrder = await orderService.processOrderPayment(
      req.tenantContext,
      req.params.branchId,
      req.params.id,
      req.body
    );

    return sendSuccess(res, {
      message: "Order payment processed successfully",
      data: paidOrder,
    });
  });

  processOrderRefund = asyncHandler(async (req, res) => {
    const refundedOrder = await orderService.processOrderRefund(
      req.tenantContext,
      req.params.branchId,
      req.params.id,
      req.body
    );

    return sendSuccess(res, {
      message: "Order payment refunded successfully",
      data: refundedOrder,
    });
  });
}

export const orderController = new OrderController();
export default orderController;
