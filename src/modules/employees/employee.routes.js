import { Router } from "express";
import employeeController from "./employee.controller.js";
import {
  employeeQuerySchema,
  createEmployeeSchema,
  updateEmployeeSchema,
  changePasswordSchema,
  updateRoleSchema,
} from "./employee.validation.js";
import { authenticate } from "../auth/authenticate.middleware.js";
import { authorize } from "../auth/authorize.middleware.js";
import { requireTenantContext } from "../../shared/middleware/tenant-context.js";
import { validate } from "../../shared/middleware/validate.js";

const router = Router();

// Base Pipeline for all employee endpoints: authenticate -> requireTenantContext
router.use(authenticate, requireTenantContext);

router.get("/", authorize("employees.view"), validate(employeeQuerySchema), (req, res, next) => {
  employeeController.listEmployees(req, res, next);
});

router.get("/:id", authorize("employees.view"), (req, res, next) => {
  employeeController.getEmployeeById(req, res, next);
});

router.post("/", authorize("employees.manage"), validate(createEmployeeSchema), (req, res, next) => {
  employeeController.createEmployee(req, res, next);
});

router.patch("/:id", authorize("employees.manage"), validate(updateEmployeeSchema), (req, res, next) => {
  employeeController.updateEmployee(req, res, next);
});

// Self-or-Manager Password Change Middleware (Fix #2)
const passwordChangeAuthGuard = (req, res, next) => {
  const isSelf = req.tenantContext?.employeeId === req.params.id;
  if (isSelf) {
    return next(); // Self password change allowed (currentPassword checked in service)
  }
  // Otherwise requires employees.manage permission
  return authorize("employees.manage")(req, res, next);
};

router.patch("/:id/password", passwordChangeAuthGuard, validate(changePasswordSchema), (req, res, next) => {
  employeeController.changePassword(req, res, next);
});

router.patch("/:id/role", authorize("employees.manage_roles"), validate(updateRoleSchema), (req, res, next) => {
  employeeController.updateRole(req, res, next);
});

router.delete("/:id", authorize("employees.manage"), (req, res, next) => {
  employeeController.softDeleteEmployee(req, res, next);
});

export default router;
