import { Router } from "express";
import shiftController from "./shift.controller.js";
import { authenticate } from "../auth/authenticate.middleware.js";
import { authorize } from "../auth/authorize.middleware.js";
import { requireTenantContext } from "../../shared/middleware/tenant-context.js";
import { validate } from "../../shared/middleware/validate.js";
import {
  openShiftSchema,
  closeShiftSchema,
  cashMovementSchema,
  listShiftsQuerySchema,
} from "./shift.validation.js";

const shiftRouter = Router({ mergeParams: true });
shiftRouter.use(authenticate, requireTenantContext);

// 1. Get current active shift for the logged in staff
shiftRouter.get(
  "/current",
  authorize(["shifts.view", "shifts.open", "orders.create", "orders.source_cashier"]),
  (req, res, next) => shiftController.getCurrentShift(req, res, next)
);

// 2. Open a new shift
shiftRouter.post(
  "/open",
  authorize(["shifts.open", "shifts.view", "orders.create", "orders.source_cashier"]),
  validate(openShiftSchema),
  (req, res, next) => shiftController.openShift(req, res, next)
);

// 3. Get X-Report (Interim shift report)
shiftRouter.get(
  "/:shiftId/x-report",
  authorize(["shifts.view", "orders.source_cashier"]),
  (req, res, next) => shiftController.getXReport(req, res, next)
);

// 4. Close shift and generate Z-Report
shiftRouter.post(
  "/:shiftId/close",
  authorize(["shifts.close", "shifts.open", "orders.source_cashier"]),
  validate(closeShiftSchema),
  (req, res, next) => shiftController.closeShift(req, res, next)
);

// 5. Record Pay-In / Pay-Out cash movement
shiftRouter.post(
  "/:shiftId/cash-movement",
  authorize(["shifts.manage_cash", "shifts.view", "orders.source_cashier"]),
  validate(cashMovementSchema),
  (req, res, next) => shiftController.addCashMovement(req, res, next)
);

// 6. Get shift details by ID
shiftRouter.get(
  "/:shiftId",
  authorize(["shifts.view", "reports.view", "orders.source_cashier"]),
  (req, res, next) => shiftController.getShiftDetails(req, res, next)
);

// 7. List past shifts archive
shiftRouter.get(
  "/",
  authorize(["shifts.view", "reports.view", "orders.source_cashier"]),
  validate(listShiftsQuerySchema),
  (req, res, next) => shiftController.listShifts(req, res, next)
);

export default shiftRouter;
