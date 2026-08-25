import phoneOrderService from "./phone-order.service.js";
import { sendSuccess } from "../../shared/utils/response.js";

export class PhoneOrderController {
  async lookup(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body ?? {};
      const data = await phoneOrderService.lookup(req.tenantContext, body);
      return sendSuccess(res, { data });
    } catch (error) {
      next(error);
    }
  }

  async createPhoneOrder(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body ?? {};
      const order = await phoneOrderService.createPhoneOrder(req.tenantContext, req.params.branchId, body);
      return sendSuccess(res, {
        statusCode: 201,
        message: "Phone order created successfully",
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const phoneOrderController = new PhoneOrderController();
export default phoneOrderController;
