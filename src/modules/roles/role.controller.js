import roleService from "./role.service.js";
import { sendSuccess } from "../../shared/utils/response.js";

export class RoleController {
  async listRoles(req, res, next) {
    try {
      const roles = await roleService.listRoles(req.tenantContext);
      return sendSuccess(res, {
        data: roles,
      });
    } catch (error) {
      next(error);
    }
  }

  async getRoleById(req, res, next) {
    try {
      const role = await roleService.getRoleById(req.tenantContext, req.params.id);
      return sendSuccess(res, {
        data: role,
      });
    } catch (error) {
      next(error);
    }
  }

  async createRole(req, res, next) {
    try {
      const role = await roleService.createRole(req.tenantContext, req.validated?.body ?? req.body ?? {});
      return sendSuccess(res, {
        statusCode: 201,
        message: "Role created successfully",
        data: role,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateRole(req, res, next) {
    try {
      const role = await roleService.updateRole(req.tenantContext, req.params.id, req.validated?.body ?? req.body ?? {});
      return sendSuccess(res, {
        message: "Role updated successfully",
        data: role,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteRole(req, res, next) {
    try {
      const result = await roleService.deleteRole(req.tenantContext, req.params.id);
      return sendSuccess(res, {
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const roleController = new RoleController();
export default roleController;
