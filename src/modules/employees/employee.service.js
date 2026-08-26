import employeeRepository from "./employee.repository.js";
import authRepository from "../auth/auth.repository.js";
import { hashPassword, verifyPassword } from "../auth/keychain.js";
import {
  AuthenticationError,
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from "../../shared/errors/index.js";
import prisma from "../../lib/prisma.js";
import redis from "../../config/redis.js";
import logger from "../../config/logger.js";

async function invalidatePermissionCache(employeeId) {
  try {
    await redis.del(`permissions:${employeeId}`);
  } catch (err) {
    logger.warn({ err: err.message, employeeId }, "Failed to invalidate permission cache");
  }
}

export class EmployeeService {
  async listEmployees(tenantContext, { page = 1, limit = 20, branchId, search, status, roleId, sort }) {
    const { items, total } = await employeeRepository.findEmployees(tenantContext, {
      page,
      limit,
      branchId,
      search,
      status,
      roleId,
      sort,
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  async getEmployeeById(tenantContext, id) {
    const employee = await employeeRepository.findEmployeeById(tenantContext, id);
    if (!employee) {
      throw new NotFoundError("Employee not found");
    }
    return employee;
  }

  async createEmployee(tenantContext, data) {

    const existing = await employeeRepository.findEmployeeByEmail(tenantContext, data.email);
    if (existing) {
      throw new ConflictError(`Employee with email '${data.email}' already exists in this restaurant`);
    }

    const role = await prisma.role.findFirst({
      where: {
        id: data.roleId,
        restaurantId: tenantContext.restaurantId,
      },
    });

    if (!role) {
      throw new NotFoundError("Target role not found");
    }

    if (role.isSystem && role.name === "owner") {
      throw new BusinessRuleError("Cannot create additional owner employees");
    }

    const branch = await prisma.branch.findFirst({
      where: {
        id: data.branchId,
        restaurantId: tenantContext.restaurantId,
      },
    });

    if (!branch) {
      throw new NotFoundError("Target branch not found");
    }

    const passwordHash = await hashPassword(data.password);

    return employeeRepository.createEmployee(tenantContext, {
      name: data.name,
      email: data.email,
      phone: data.phone || null,
      branchId: data.branchId,
      roleId: data.roleId,
      passwordHash,
    });
  }

  async updateEmployee(tenantContext, id, data) {
    if (data.branchId) {
      const branch = await prisma.branch.findFirst({
        where: {
          id: data.branchId,
          restaurantId: tenantContext.restaurantId,
        },
      });

      if (!branch) {
        throw new NotFoundError("Target branch not found");
      }
    }

    const updated = await employeeRepository.updateEmployee(tenantContext, id, {
      ...(data.name ? { name: data.name } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(data.branchId ? { branchId: data.branchId } : {}),
      ...(data.status ? { status: data.status } : {}),
    });

    if (!updated) {
      throw new NotFoundError("Employee not found");
    }

    if (data.status && data.status !== "ACTIVE") {
      await authRepository.forceLogoutEmployee(tenantContext.restaurantId, id);
    }
    await invalidatePermissionCache(id);
    return updated;
  }

  async changePassword(tenantContext, targetId, { currentPassword, newPassword }) {
    const isSelf = tenantContext.employeeId === targetId;

    if (isSelf) {
      if (!currentPassword) {
        throw new AuthenticationError("Current password is required to change your own password");
      }
      const rawEmployee = await prisma.employee.findFirst({
        where: {
          id: targetId,
          restaurantId: tenantContext.restaurantId,
          deletedAt: null,
        },
      });

      const validCurrent = await verifyPassword(currentPassword, rawEmployee?.passwordHash);
      if (!validCurrent) {
        throw new AuthenticationError("Current password is incorrect");
      }
    }

    const newPasswordHash = await hashPassword(newPassword);
    const updated = await employeeRepository.updatePasswordHash(tenantContext, targetId, newPasswordHash);

    if (!updated) {
      throw new NotFoundError("Employee not found");
    }

    await authRepository.forceLogoutEmployee(tenantContext.restaurantId, targetId);
    await invalidatePermissionCache(targetId);

    return { message: "Password updated successfully. Other active sessions closed." };
  }

  async updateRole(tenantContext, targetId, roleId) {
    if (tenantContext.employeeId === targetId) {
      throw new BusinessRuleError("You cannot modify your own role");
    }

    const role = await prisma.role.findFirst({
      where: {
        id: roleId,
        restaurantId: tenantContext.restaurantId,
      },
    });

    if (!role) {
      throw new NotFoundError("Target role not found");
    }

    const updated = await employeeRepository.updateRole(tenantContext, targetId, roleId);
    if (!updated) {
      throw new NotFoundError("Employee not found");
    }

    await invalidatePermissionCache(targetId);
    return updated;
  }

  async softDeleteEmployee(tenantContext, id) {
    if (tenantContext.employeeId === id) {
      throw new BusinessRuleError("You cannot delete your own account");
    }

    const result = await employeeRepository.softDeleteEmployee(tenantContext, id);
    if (!result) {
      throw new NotFoundError("Employee not found");
    }

    await authRepository.forceLogoutEmployee(tenantContext.restaurantId, id);
    await invalidatePermissionCache(id);
    return { message: "Employee soft-deleted successfully" };
  }
}

export const employeeService = new EmployeeService();
export default employeeService;
