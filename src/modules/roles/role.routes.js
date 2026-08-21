import { Router } from "express";
import roleController from "./role.controller.js";
import { createRoleSchema, updateRoleSchema } from "./role.validation.js";
import { authenticate } from "../auth/authenticate.middleware.js";
import { authorize } from "../auth/authorize.middleware.js";
import { requireTenantContext } from "../../shared/middleware/tenant-context.js";
import { validate } from "../../shared/middleware/validate.js";

const router = Router();

router.use(authenticate, requireTenantContext);

router.get("/", authorize("employees.view"), (req, res, next) => {
  roleController.listRoles(req, res, next);
});

router.get("/permissions/catalog", authorize("employees.view"), (req, res, next) => {
  roleController.getPermissionsCatalog(req, res, next);
});

router.get("/:id", authorize("employees.view"), (req, res, next) => {
  roleController.getRoleById(req, res, next);
});

router.post("/", authorize("employees.manage_roles"), validate(createRoleSchema), (req, res, next) => {
  roleController.createRole(req, res, next);
});

router.patch("/:id", authorize("employees.manage_roles"), validate(updateRoleSchema), (req, res, next) => {
  roleController.updateRole(req, res, next);
});

router.delete("/:id", authorize("employees.manage_roles"), (req, res, next) => {
  roleController.deleteRole(req, res, next);
});

export default router;
