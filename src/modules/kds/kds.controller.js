import kdsService from "./kds.service.js";
import { sendSuccess } from "../../shared/utils/response.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";

export class KdsController {
  getActiveKitchenOrders = asyncHandler(async (req, res) => {
    const { page, limit, status } = req.query;
    const { items, pagination } = await kdsService.getActiveKitchenOrders(req.tenantContext, req.params.branchId, {
      page,
      limit,
      status,
    });
    return sendSuccess(res, { data: items, pagination });
  });

  updateKitchenOrderStatus = asyncHandler(async (req, res) => {
    const { newStatus, expectedVersion, reason } = req.body;
    const updatedOrder = await kdsService.updateKitchenOrderStatus(
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
      message: `Kitchen order status updated to '${updatedOrder.status}'`,
      data: updatedOrder,
    });
  });
}

export const kdsController = new KdsController();
export default kdsController;
