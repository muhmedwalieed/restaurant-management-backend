import kdsService from "./kds.service.js";
import { sendSuccess } from "../../shared/utils/response.js";

export class KdsController {
  async getActiveKitchenOrders(req, res, next) {
    try {
      const query = req.validated?.query ?? req.query ?? {};
      const page = query.page ? parseInt(query.page, 10) : 1;
      const limit = query.limit ? Math.min(parseInt(query.limit, 10), 100) : 20;

      const { items, pagination } = await kdsService.getActiveKitchenOrders(req.tenantContext, req.params.branchId, {
        page,
        limit,
        status: query.status,
      });

      return sendSuccess(res, {
        data: items,
        pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateKitchenOrderStatus(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body ?? {};
      const updatedOrder = await kdsService.updateKitchenOrderStatus(
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
        message: `Kitchen order status updated to '${updatedOrder.status}'`,
        data: updatedOrder,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const kdsController = new KdsController();
export default kdsController;
