import orderService from "./order.service.js";
import { sendSuccess } from "../../shared/utils/response.js";

export class OrderController {
  async listOrders(req, res, next) {
    try {
      const query = req.validated?.query ?? req.query ?? {};
      const page = query.page ? parseInt(query.page, 10) : 1;
      const limit = query.limit ? Math.min(parseInt(query.limit, 10), 100) : 20;

      const { items, pagination } = await orderService.listOrders(req.tenantContext, req.params.branchId, {
        page,
        limit,
        status: query.status,
        type: query.type,
        source: query.source,
        tableId: query.tableId,
      });

      return sendSuccess(res, {
        data: items,
        pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  async getOrderById(req, res, next) {
    try {
      const order = await orderService.getOrderById(req.tenantContext, req.params.branchId, req.params.id);
      return sendSuccess(res, {
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }

  async createOrder(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body ?? {};
      const idempotencyKey = req.headers["idempotency-key"] || req.headers["x-idempotency-key"] || null;

      const result = await orderService.createOrder(req.tenantContext, req.params.branchId, body, idempotencyKey);

      if (result.isCached) {
        return res.status(result.statusCode).json(result.data);
      }

      return sendSuccess(res, {
        statusCode: 201,
        message: "Order created successfully",
        data: result.data,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateOrderStatus(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body ?? {};
      const updatedOrder = await orderService.updateOrderStatus(
        req.tenantContext,
        req.params.branchId,
        req.params.id,
        {
          newStatus: body.newStatus,
          expectedVersion: body.expectedVersion,
          reason: body.reason,
        }
      );

      return sendSuccess(res, {
        message: `Order status updated to '${updatedOrder.status}'`,
        data: updatedOrder,
      });
    } catch (error) {
      next(error);
    }
  }

  async cancelOrder(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body ?? {};
      const cancelledOrder = await orderService.cancelOrder(
        req.tenantContext,
        req.params.branchId,
        req.params.id,
        {
          expectedVersion: body.expectedVersion,
          reason: body.reason,
        }
      );

      return sendSuccess(res, {
        message: "Order cancelled successfully",
        data: cancelledOrder,
      });
    } catch (error) {
      next(error);
    }
  }

  async getOrderHistory(req, res, next) {
    try {
      const history = await orderService.getOrderHistory(req.tenantContext, req.params.branchId, req.params.id);
      return sendSuccess(res, {
        data: history,
      });
    } catch (error) {
      next(error);
    }
  }

  async createPublicOrder(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body ?? {};
      const idempotencyKey = req.headers["idempotency-key"] || req.headers["x-idempotency-key"] || null;

      const result = await orderService.createPublicOrder(body, idempotencyKey);

      if (result.isCached) {
        return res.status(result.statusCode).json(result.data);
      }

      return sendSuccess(res, {
        statusCode: 201,
        message: "Order submitted successfully",
        data: result.data,
      });
    } catch (error) {
      next(error);
    }
  }

  async createPosOrder(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body ?? {};
      const idempotencyKey = req.headers["idempotency-key"] || req.headers["x-idempotency-key"] || null;

      const result = await orderService.createPosOrder(req.tenantContext, req.params.branchId, body, idempotencyKey);

      if (result.isCached) {
        return res.status(result.statusCode).json(result.data);
      }

      return sendSuccess(res, {
        statusCode: 201,
        message: "POS order created successfully",
        data: result.data,
      });
    } catch (error) {
      next(error);
    }
  }

  async processOrderPayment(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body ?? {};
      const paidOrder = await orderService.processOrderPayment(
        req.tenantContext,
        req.params.branchId,
        req.params.id,
        body
      );

      return sendSuccess(res, {
        message: "Order payment processed successfully",
        data: paidOrder,
      });
    } catch (error) {
      next(error);
    }
  }

  async processOrderRefund(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body ?? {};
      const refundedOrder = await orderService.processOrderRefund(
        req.tenantContext,
        req.params.branchId,
        req.params.id,
        body
      );

      return sendSuccess(res, {
        message: "Order payment refunded successfully",
        data: refundedOrder,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const orderController = new OrderController();
export default orderController;
