import couponService from "./coupon.service.js";
import { sendSuccess } from "../../shared/utils/response.js";

export class CouponController {
  async list(req, res, next) {
    try {
      const query = req.validated?.query ?? req.query ?? {};
      const page = query.page ? parseInt(query.page, 10) : 1;
      const limit = query.limit ? Math.min(parseInt(query.limit, 10), 100) : 20;
      const { items, pagination } = await couponService.listCoupons(req.tenantContext, {
        page,
        limit,
        isActive: query.isActive,
        type: query.type,
        q: query.q,
      });
      return sendSuccess(res, { data: items, pagination });
    } catch (error) {
      next(error);
    }
  }

  async getById(req, res, next) {
    try {
      const coupon = await couponService.getCouponById(req.tenantContext, req.params.id);
      return sendSuccess(res, { data: coupon });
    } catch (error) {
      next(error);
    }
  }

  async create(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body ?? {};
      const coupon = await couponService.createCoupon(req.tenantContext, body);
      return sendSuccess(res, { statusCode: 201, message: "Coupon created successfully", data: coupon });
    } catch (error) {
      next(error);
    }
  }

  async update(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body ?? {};
      const coupon = await couponService.updateCoupon(req.tenantContext, req.params.id, body);
      return sendSuccess(res, { message: "Coupon updated successfully", data: coupon });
    } catch (error) {
      next(error);
    }
  }

  async remove(req, res, next) {
    try {
      const result = await couponService.deleteCoupon(req.tenantContext, req.params.id);
      return sendSuccess(res, { message: result.message });
    } catch (error) {
      next(error);
    }
  }

  async validate(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body ?? {};
      const result = await couponService.validateCoupon(req.tenantContext, body);
      return sendSuccess(res, { data: result });
    } catch (error) {
      next(error);
    }
  }
}

export const couponController = new CouponController();
export default couponController;
