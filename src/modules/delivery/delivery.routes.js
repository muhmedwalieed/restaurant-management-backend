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

// 2. Pending handovers awaiting cashier approval (Cashier/POS)
deliveryRouter.get(
  "/pending-handovers",
  authorize(["orders.view", "delivery.view", "orders.update", "orders.source_cashier"]),
  (req, res, next) => deliveryController.getPendingHandovers(req, res, next)
);

// 3. Driver requests pickup (requires cashier handover approval)
deliveryRouter.post(
  "/orders/:orderId/request-pickup",
  authorize(["delivery.update_status", "orders.update", "delivery.view"]),
  (req, res, next) => deliveryController.requestPickup(req, res, next)
);

// 4. Cashier approves driver handover
deliveryRouter.post(
  "/orders/:orderId/approve-pickup",
  authorize(["orders.update", "orders.source_cashier", "delivery.update_status"]),
  (req, res, next) => deliveryController.approvePickup(req, res, next)
);

// 5. Cashier rejects driver handover
deliveryRouter.post(
  "/orders/:orderId/reject-pickup",
  authorize(["orders.update", "orders.source_cashier", "delivery.update_status"]),
  (req, res, next) => deliveryController.rejectPickup(req, res, next)
);

// 6. Driver cancels own pickup request
deliveryRouter.post(
  "/orders/:orderId/cancel-pickup",
  authorize(["delivery.update_status", "orders.update", "delivery.view"]),
  (req, res, next) => deliveryController.cancelPickup(req, res, next)
);

// 7. Cashier assigns delivery order to driver
deliveryRouter.post(
  "/orders/:orderId/assign-driver",
  authorize(["orders.update", "orders.source_cashier", "delivery.update_status", "delivery.settle"]),
  (req, res, next) => deliveryController.assignDriver(req, res, next)
);

// 8. Driver accepts cashier assignment
deliveryRouter.post(
  "/orders/:orderId/accept-assignment",
  authorize(["delivery.update_status", "orders.update", "delivery.view"]),
  (req, res, next) => deliveryController.acceptDriverAssignment(req, res, next)
);

// 9. Driver rejects cashier assignment
deliveryRouter.post(
  "/orders/:orderId/reject-assignment",
  authorize(["delivery.update_status", "orders.update", "delivery.view"]),
  (req, res, next) => deliveryController.rejectDriverAssignment(req, res, next)
);

// 10. Cashier cancels driver assignment
deliveryRouter.post(
  "/orders/:orderId/cancel-assignment",
  authorize(["orders.update", "orders.source_cashier", "delivery.update_status", "delivery.settle"]),
  (req, res, next) => deliveryController.cancelDriverAssignment(req, res, next)
);

// 7. Pick up order (direct fallback)
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

// 4. Mark delivery failed (Returns order to restaurant)
deliveryRouter.post(
  "/orders/:orderId/fail",
  authorize(["delivery.update_status", "orders.update"]),
  validate(failDeliverySchema),
  (req, res, next) => deliveryController.failDelivery(req, res, next)
);

// 4b. Driver hands over returned order to cashier
deliveryRouter.post(
  "/orders/:orderId/handover-return",
  authorize(["delivery.update_status", "orders.update", "delivery.view"]),
  (req, res, next) => deliveryController.handoverReturn(req, res, next)
);

// 4c. Cashier confirms receiving returned order from driver
deliveryRouter.post(
  "/orders/:orderId/confirm-return",
  authorize(["orders.update", "orders.source_cashier", "delivery.settle"]),
  (req, res, next) => deliveryController.confirmReturn(req, res, next)
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
