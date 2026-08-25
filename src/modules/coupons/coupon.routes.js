import { Router } from "express";
import couponController from "./coupon.controller.js";
import { createCouponSchema, updateCouponSchema, couponQuerySchema, validateCouponSchema } from "./coupon.validation.js";
import { authenticate } from "../auth/authenticate.middleware.js";
import { authorize } from "../auth/authorize.middleware.js";
import { requireTenantContext } from "../../shared/middleware/tenant-context.js";
import { validate } from "../../shared/middleware/validate.js";

const router = Router();

router.use(authenticate, requireTenantContext);

router.get("/", authorize("coupons.manage"), validate(couponQuerySchema), (req, res, next) => {
  couponController.list(req, res, next);
});

router.post("/", authorize("coupons.manage"), validate(createCouponSchema), (req, res, next) => {
  couponController.create(req, res, next);
});

router.get("/:id", authorize("coupons.manage"), (req, res, next) => {
  couponController.getById(req, res, next);
});

router.patch("/:id", authorize("coupons.manage"), validate(updateCouponSchema), (req, res, next) => {
  couponController.update(req, res, next);
});

router.delete("/:id", authorize("coupons.manage"), (req, res, next) => {
  couponController.remove(req, res, next);
});

router.post("/validate", authorize("orders.create"), validate(validateCouponSchema), (req, res, next) => {
  couponController.validate(req, res, next);
});

export default router;
