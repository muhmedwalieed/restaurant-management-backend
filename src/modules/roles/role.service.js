import roleRepository from "./role.repository.js";
import { GLOBAL_PERMISSIONS } from "../permissions/permission.catalog.js";
import { BusinessRuleError, ConflictError, NotFoundError } from "../../shared/errors/index.js";
import { AuditAction, auditLogService } from "../audit-logs/audit-log.service.js";
import redis from "../../config/redis.js";
import logger from "../../config/logger.js";

const RESERVED_ROLE_NAMES = new Set(["owner", "manager"]);

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

  getPermissionsCatalog() {
    const grouped = [];
    for (const perm of GLOBAL_PERMISSIONS) {
      const module = perm.key.split(".")[0];
      const entry = grouped.find((g) => g.module === module);
      const item = { key: perm.key, name: perm.description };
      if (entry) {
        entry.permissions.push(item);
      } else {
        grouped.push({ module, permissions: [item] });
      }
    }
    return grouped;
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

    if (RESERVED_ROLE_NAMES.has(normalizedName)) {
      throw new ConflictError(`System role name '${normalizedName}' is reserved and cannot be created`);
    }

    const existing = await roleRepository.findRoleByName(tenantContext, normalizedName);
    if (existing) {
      throw new ConflictError(`Role with name '${normalizedName}' already exists in this restaurant`);
    }

    const createdRole = await roleRepository.createRole(tenantContext, {
      name: normalizedName,
      description,
      permissionKeys: permissions,
    });

    await auditLogService.record(tenantContext, {
      actorEmployeeId: tenantContext.employeeId || null,
      action: AuditAction.ROLE_CREATED,
      entityType: "role",
      entityId: createdRole.id,
      metadata: { name: normalizedName, permissionKeys: permissions || [] },
    });

    return createdRole;
  }

  async updateRole(tenantContext, id, { name, description, permissions } = {}) {
    const existing = await roleRepository.findRoleById(tenantContext, id);
    if (!existing) {
      throw new NotFoundError("Role not found");
    }

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

    await auditLogService.record(tenantContext, {
      actorEmployeeId: tenantContext.employeeId || null,
      action: AuditAction.ROLE_UPDATED,
      entityType: "role",
      entityId: id,
      metadata: { name: updatedRole?.name || existing.name, permissionKeys: permissions },
    });

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

    await auditLogService.record(tenantContext, {
      actorEmployeeId: tenantContext.employeeId || null,
      action: AuditAction.ROLE_DELETED,
      entityType: "role",
      entityId: id,
      metadata: { name: existing.name },
    });

    return { message: "Role deleted successfully" };
  }
}

export const roleService = new RoleService();
export default roleService;
