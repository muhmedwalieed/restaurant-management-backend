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

const router = Router();

// Base Pipeline for all employee endpoints: authenticate -> requireTenantContext
router.use(authenticate, requireTenantContext);

router.get("/", authorize("employees.view"), (req, res, next) => {
  employeeQuerySchema.parse({ query: req.query });
  employeeController.listEmployees(req, res, next);
});

router.get("/:id", authorize("employees.view"), (req, res, next) => {
  employeeController.getEmployeeById(req, res, next);
});

router.post("/", authorize("employees.manage"), (req, res, next) => {
  createEmployeeSchema.parse({ body: req.body });
  employeeController.createEmployee(req, res, next);
});

router.patch("/:id", authorize("employees.manage"), (req, res, next) => {
  updateEmployeeSchema.parse({ body: req.body });
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

router.patch("/:id/password", passwordChangeAuthGuard, (req, res, next) => {
  changePasswordSchema.parse({ body: req.body });
  employeeController.changePassword(req, res, next);
});

router.patch("/:id/role", authorize("employees.manage_roles"), (req, res, next) => {
  updateRoleSchema.parse({ body: req.body });
  employeeController.updateRole(req, res, next);
});

router.delete("/:id", authorize("employees.manage"), (req, res, next) => {
  employeeController.softDeleteEmployee(req, res, next);
});

export default router;
