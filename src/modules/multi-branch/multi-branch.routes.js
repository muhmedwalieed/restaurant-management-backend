import { Router } from "express";
import multiBranchController from "./multi-branch.controller.js";
import { grantBranchAccessSchema } from "./multi-branch.validation.js";
import { authenticate } from "../auth/authenticate.middleware.js";
import { authorize } from "../auth/authorize.middleware.js";
import { requireTenantContext } from "../../shared/middleware/tenant-context.js";
import { validate } from "../../shared/middleware/validate.js";

// Branch users: mounted at /v1/branches/:branchId/users
const branchUsersRouter = Router({ mergeParams: true });
branchUsersRouter.use(authenticate, requireTenantContext);

branchUsersRouter.get("/", authorize("branches.manage"), (req, res, next) => {
  multiBranchController.listBranchUsers(req, res, next);
});

branchUsersRouter.post("/", authorize("branches.manage"), validate(grantBranchAccessSchema), (req, res, next) => {
  multiBranchController.grantAccess(req, res, next);
});

branchUsersRouter.delete("/:employeeId", authorize("branches.manage"), (req, res, next) => {
  multiBranchController.revokeAccess(req, res, next);
});

// My accessible branches (branch switcher): mounted at /v1/employees/me/branches
const myBranchesRouter = Router();
myBranchesRouter.use(authenticate, requireTenantContext);

myBranchesRouter.get("/", (req, res, next) => {
  multiBranchController.listMyBranches(req, res, next);
});

export { branchUsersRouter, myBranchesRouter };
export default branchUsersRouter;