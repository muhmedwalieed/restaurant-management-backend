import { Router } from "express";
import branchController from "./branch.controller.js";
import {
  branchQuerySchema,
  createBranchSchema,
  updateBranchSchema,
  updateWorkingHoursSchema,
  updateBranchSettingsSchema,
} from "./branch.validation.js";
import { authenticate } from "../auth/authenticate.middleware.js";
import { authorize } from "../auth/authorize.middleware.js";
import { requireTenantContext } from "../../shared/middleware/tenant-context.js";
import { validate } from "../../shared/middleware/validate.js";

const router = Router();

// Middleware pipeline: authenticate -> requireTenantContext
router.use(authenticate, requireTenantContext);

router.get("/", authorize("branches.manage"), validate(branchQuerySchema), (req, res, next) => {
  branchController.listBranches(req, res, next);
});

router.get("/:id", authorize("branches.manage"), (req, res, next) => {
  branchController.getBranchById(req, res, next);
});

router.post("/", authorize("branches.manage"), validate(createBranchSchema), (req, res, next) => {
  branchController.createBranch(req, res, next);
});

router.patch("/:id", authorize("branches.manage"), validate(updateBranchSchema), (req, res, next) => {
  branchController.updateBranch(req, res, next);
});

router.delete("/:id", authorize("branches.manage"), (req, res, next) => {
  branchController.deleteBranch(req, res, next);
});

router.get("/:id/working-hours", authorize("branches.manage"), (req, res, next) => {
  branchController.getWorkingHours(req, res, next);
});

router.put(
  "/:id/working-hours",
  authorize("branches.manage"),
  validate(updateWorkingHoursSchema),
  (req, res, next) => {
    branchController.updateWorkingHours(req, res, next);
  }
);

router.get("/:id/settings", authorize("branches.manage"), (req, res, next) => {
  branchController.getBranchSettings(req, res, next);
});

router.put(
  "/:id/settings",
  authorize("branches.manage"),
  validate(updateBranchSettingsSchema),
  (req, res, next) => {
    branchController.updateBranchSettings(req, res, next);
  }
);

export default router;
