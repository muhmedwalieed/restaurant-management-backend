import roleService from "./role.service.js";
import { sendSuccess } from "../../shared/utils/response.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";

export class RoleController {
  listRoles = asyncHandler(async (req, res) => {
    const roles = await roleService.listRoles(req.tenantContext);
    return sendSuccess(res, { data: roles });
  });

  getPermissionsCatalog = asyncHandler(async (req, res) => {
    const catalog = roleService.getPermissionsCatalog();
    return sendSuccess(res, { data: catalog });
  });

  getRoleById = asyncHandler(async (req, res) => {
    const role = await roleService.getRoleById(req.tenantContext, req.params.id);
    return sendSuccess(res, { data: role });
  });

  createRole = asyncHandler(async (req, res) => {
    const role = await roleService.createRole(req.tenantContext, req.body);
    return sendSuccess(res, {
      statusCode: 201,
      message: "Role created successfully",
      data: role,
    });
  });

  updateRole = asyncHandler(async (req, res) => {
    const role = await roleService.updateRole(req.tenantContext, req.params.id, req.body);
    return sendSuccess(res, {
      message: "Role updated successfully",
      data: role,
    });
  });

  deleteRole = asyncHandler(async (req, res) => {
    const result = await roleService.deleteRole(req.tenantContext, req.params.id);
    return sendSuccess(res, { message: result.message });
  });
}

export const roleController = new RoleController();
export default roleController;
