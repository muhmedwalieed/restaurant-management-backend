import roleRepository from "./role.repository.js";
import { BusinessRuleError, ConflictError, NotFoundError } from "../../shared/errors/index.js";
import redis from "../../config/redis.js";
import logger from "../../config/logger.js";

const RESERVED_ROLE_NAMES = new Set(["owner", "manager"]);

/**
 * Invalidates Redis permission cache for an array of employee IDs.
 */
async function invalidateEmployeesCache(employeeIds) {
  if (!employeeIds || employeeIds.length === 0) return;
  try {
    const pipeline = redis.pipeline();
    for (const empId of employeeIds) {
      pipeline.del(`permissions:${empId}`);
    }
    await pipeline.exec();
  } catch (err) {
    logger.warn({ err: err.message }, "Failed to invalidate employees cache on role update");
  }
}

export class RoleService {
  async listRoles(tenantContext) {
    return roleRepository.findRoles(tenantContext);
  }

  async getRoleById(tenantContext, id) {
    const role = await roleRepository.findRoleById(tenantContext, id);
    if (!role) {
      throw new NotFoundError("Role not found");
    }
    return role;
  }

  async createRole(tenantContext, { name, description, permissions }) {
    const normalizedName = name.trim().toLowerCase();

    // Reserved role names check (Fix #3):
    if (RESERVED_ROLE_NAMES.has(normalizedName)) {
      throw new ConflictError(`System role name '${normalizedName}' is reserved and cannot be created`);
    }

    const existing = await roleRepository.findRoleByName(tenantContext, normalizedName);
    if (existing) {
      throw new ConflictError(`Role with name '${normalizedName}' already exists in this restaurant`);
    }

    return roleRepository.createRole(tenantContext, {
      name: normalizedName,
      description,
      permissionKeys: permissions,
    });
  }

  async updateRole(tenantContext, id, { name, description, permissions }) {
    const existing = await roleRepository.findRoleById(tenantContext, id);
    if (!existing) {
      throw new NotFoundError("Role not found");
    }

    // System role modification restriction (Fix #3):
    if (existing.isSystem) {
      throw new BusinessRuleError("System roles cannot be modified");
    }

    if (name) {
      const normalizedName = name.trim().toLowerCase();
      if (RESERVED_ROLE_NAMES.has(normalizedName)) {
        throw new ConflictError(`System role name '${normalizedName}' is reserved`);
      }
    }

    const updatedRole = await roleRepository.updateRole(tenantContext, id, {
      name,
      description,
      permissionKeys: permissions,
    });

    // Invalidate Redis cache for all employees holding this role
    const assignedEmpIds = await roleRepository.findAssignedEmployeeIds(tenantContext, id);
    await invalidateEmployeesCache(assignedEmpIds);

    return updatedRole;
  }

  async deleteRole(tenantContext, id) {
    const existing = await roleRepository.findRoleById(tenantContext, id);
    if (!existing) {
      throw new NotFoundError("Role not found");
    }

    if (existing.isSystem) {
      throw new BusinessRuleError("System roles cannot be deleted");
    }

    if (existing._count && existing._count.employees > 0) {
      throw new ConflictError(
        `Cannot delete role '${existing.name}' because it is assigned to ${existing._count.employees} active employee(s)`
      );
    }

    const assignedEmpIds = await roleRepository.findAssignedEmployeeIds(tenantContext, id);

    await roleRepository.deleteRole(tenantContext, id);
    await invalidateEmployeesCache(assignedEmpIds);

    return { message: "Role deleted successfully" };
  }
}

export const roleService = new RoleService();
export default roleService;
