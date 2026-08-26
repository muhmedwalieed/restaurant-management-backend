import phoneOrderService from "./phone-order.service.js";
import { sendSuccess } from "../../shared/utils/response.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";

export class PhoneOrderController {
  lookup = asyncHandler(async (req, res) => {
    const data = await phoneOrderService.lookup(req.tenantContext, req.body);
    return sendSuccess(res, { data });
  });

  createPhoneOrder = asyncHandler(async (req, res) => {
    const order = await phoneOrderService.createPhoneOrder(req.tenantContext, req.params.branchId, req.body);
    return sendSuccess(res, {
      statusCode: 201,
      message: "Phone order created successfully",
      data: order,
    });
  });
}

export const phoneOrderController = new PhoneOrderController();
export default phoneOrderController;
