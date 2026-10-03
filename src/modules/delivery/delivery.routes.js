import { Router } from "express";
import deliveryController from "./delivery.controller.js";
import { authenticate } from "../auth/authenticate.middleware.js";
import { authorize } from "../auth/authorize.middleware.js";
import { requireTenantContext } from "../../shared/middleware/tenant-context.js";
import { validate } from "../../shared/middleware/validate.js";
import {
  pickupOrderSchema,
  deliverOrderSchema,
  failDeliverySchema,
  settleDriverCashSchema,
} from "./delivery.validation.js";

const deliveryRouter = Router({ mergeParams: true });
deliveryRouter.use(authenticate, requireTenantContext);

// 1. List delivery orders (drivers and cashiers with delivery.view or orders.view)
deliveryRouter.get(
  "/orders",
  authorize(["delivery.view", "orders.view", "delivery.update_status"]),
  (req, res, next) => deliveryController.getDeliveryOrders(req, res, next)
);

// 2. Pick up order
deliveryRouter.post(
  "/orders/:orderId/pickup",
  authorize(["delivery.update_status", "orders.update"]),
  validate(pickupOrderSchema),
  (req, res, next) => deliveryController.pickupOrder(req, res, next)
);

// 3. Mark delivered
deliveryRouter.post(
  "/orders/:orderId/deliver",
  authorize(["delivery.update_status", "orders.update"]),
  validate(deliverOrderSchema),
  (req, res, next) => deliveryController.deliverOrder(req, res, next)
);

// 4. Mark delivery failed
deliveryRouter.post(
  "/orders/:orderId/fail",
  authorize(["delivery.update_status", "orders.update"]),
  validate(failDeliverySchema),
  (req, res, next) => deliveryController.failDelivery(req, res, next)
);

// 5. Driver COD Wallet
deliveryRouter.get(
  "/wallet",
  authorize(["delivery.view", "delivery.update_status", "delivery.settle"]),
  (req, res, next) => deliveryController.getDriverWallet(req, res, next)
);

// 6. Cashier settle driver cash
deliveryRouter.post(
  "/settle",
  authorize(["delivery.settle", "orders.source_cashier", "orders.update"]),
  validate(settleDriverCashSchema),
  (req, res, next) => deliveryController.settleDriverCash(req, res, next)
);

// 7. Cashier list all branch drivers with active wallets
deliveryRouter.get(
  "/drivers",
  authorize(["delivery.settle", "orders.source_cashier", "orders.view"]),
  (req, res, next) => deliveryController.getBranchDrivers(req, res, next)
);

export default deliveryRouter;
