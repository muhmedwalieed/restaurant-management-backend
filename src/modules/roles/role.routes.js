import { Router } from "express";
import roleController from "./role.controller.js";
import { createRoleSchema, updateRoleSchema } from "./role.validation.js";
import { authenticate } from "../auth/authenticate.middleware.js";
import { authorize } from "../auth/authorize.middleware.js";
import { requireTenantContext } from "../../shared/middleware/tenant-context.js";

const router = Router();

router.use(authenticate, requireTenantContext);

router.get("/", authorize("employees.view"), (req, res, next) => {
  roleController.listRoles(req, res, next);
});

router.get("/:id", authorize("employees.view"), (req, res, next) => {
  roleController.getRoleById(req, res, next);
});

router.post("/", authorize("employees.manage_roles"), (req, res, next) => {
  createRoleSchema.parse({ body: req.body });
  roleController.createRole(req, res, next);
});

router.patch("/:id", authorize("employees.manage_roles"), (req, res, next) => {
  updateRoleSchema.parse({ body: req.body });
  roleController.updateRole(req, res, next);
});

router.delete("/:id", authorize("employees.manage_roles"), (req, res, next) => {
  roleController.deleteRole(req, res, next);
});

export default router;
