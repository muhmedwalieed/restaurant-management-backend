import { Router } from "express";
import orderController from "./order.controller.js";
import {
  orderQuerySchema,
  createOrderSchema,
  updateOrderStatusSchema,
  cancelOrderSchema,
  publicOrderSchema,
  posOrderSchema,
  paymentSchema,
  refundSchema,
  trackOrderQuerySchema,
} from "./order.validation.js";
import { publicOrderRateLimiter } from "../../shared/middleware/rate-limiters.js";
import { authenticate } from "../auth/authenticate.middleware.js";
import { authorize } from "../auth/authorize.middleware.js";
import { requireTenantContext } from "../../shared/middleware/tenant-context.js";
import { validate } from "../../shared/middleware/validate.js";

const router = Router();

router.post("/orders/public", publicOrderRateLimiter, validate(publicOrderSchema), (req, res, next) => {
  orderController.createPublicOrder(req, res, next);
});

router.get("/orders/track", publicOrderRateLimiter, validate(trackOrderQuerySchema), (req, res, next) => {
  orderController.trackOrder(req, res, next);
});

const branchPosRouter = Router({ mergeParams: true });
branchPosRouter.use(authenticate, requireTenantContext);

branchPosRouter.post("/", authorize("orders.create"), validate(posOrderSchema), (req, res, next) => {
  orderController.createPosOrder(req, res, next);
});

router.use("/branches/:branchId/pos/orders", branchPosRouter);

const tenantOrderRouter = Router();
tenantOrderRouter.use(authenticate, requireTenantContext);

tenantOrderRouter.get("/", authorize("orders.view"), validate(orderQuerySchema), (req, res, next) => {
  orderController.listAllOrders(req, res, next);
});

router.use("/orders", tenantOrderRouter);

const branchOrderRouter = Router({ mergeParams: true });
branchOrderRouter.use(authenticate, requireTenantContext);

branchOrderRouter.get("/", authorize("orders.view"), validate(orderQuerySchema), (req, res, next) => {
  orderController.listOrders(req, res, next);
});

branchOrderRouter.post("/", authorize("orders.create"), validate(createOrderSchema), (req, res, next) => {
  orderController.createOrder(req, res, next);
});

branchOrderRouter.get("/:id", authorize("orders.view"), (req, res, next) => {
  orderController.getOrderById(req, res, next);
});

branchOrderRouter.patch("/:id/status", authorize("orders.update"), validate(updateOrderStatusSchema), (req, res, next) => {
  orderController.updateOrderStatus(req, res, next);
});

branchOrderRouter.post("/:id/cancel", authorize("orders.cancel"), validate(cancelOrderSchema), (req, res, next) => {
  orderController.cancelOrder(req, res, next);
});

branchOrderRouter.post("/:id/payment", authorize("orders.payment"), validate(paymentSchema), (req, res, next) => {
  orderController.processOrderPayment(req, res, next);
});

branchOrderRouter.post("/:id/refund", authorize("orders.refund"), validate(refundSchema), (req, res, next) => {
  orderController.processOrderRefund(req, res, next);
});

branchOrderRouter.get("/:id/history", authorize("orders.view"), (req, res, next) => {
  orderController.getOrderHistory(req, res, next);
});

router.use("/branches/:branchId/orders", branchOrderRouter);

export default router;
