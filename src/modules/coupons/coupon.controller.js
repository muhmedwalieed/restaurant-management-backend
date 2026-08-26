import couponService from "./coupon.service.js";
import { sendSuccess } from "../../shared/utils/response.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";

export class CouponController {
  list = asyncHandler(async (req, res) => {
    const { page, limit, isActive, type, q } = req.query;
    const { items, pagination } = await couponService.listCoupons(req.tenantContext, {
      page,
      limit,
      isActive,
      type,
      q,
    });
    return sendSuccess(res, { data: items, pagination });
  });

  getById = asyncHandler(async (req, res) => {
    const coupon = await couponService.getCouponById(req.tenantContext, req.params.id);
    return sendSuccess(res, { data: coupon });
  });

  create = asyncHandler(async (req, res) => {
    const coupon = await couponService.createCoupon(req.tenantContext, req.body);
    return sendSuccess(res, { statusCode: 201, message: "Coupon created successfully", data: coupon });
  });

  update = asyncHandler(async (req, res) => {
    const coupon = await couponService.updateCoupon(req.tenantContext, req.params.id, req.body);
    return sendSuccess(res, { message: "Coupon updated successfully", data: coupon });
  });

  remove = asyncHandler(async (req, res) => {
    const result = await couponService.deleteCoupon(req.tenantContext, req.params.id);
    return sendSuccess(res, { message: result.message });
  });

  validate = asyncHandler(async (req, res) => {
    const result = await couponService.validateCoupon(req.tenantContext, req.body);
    return sendSuccess(res, { data: result });
  });
}

export const couponController = new CouponController();
export default couponController;
