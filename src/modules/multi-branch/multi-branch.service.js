import multiBranchRepository from "./multi-branch.repository.js";
import { AuditAction, auditLogService } from "../audit-logs/audit-log.service.js";
import { BusinessRuleError, ConflictError, NotFoundError, AuthorizationError } from "../../shared/errors/index.js";
import { getEmployeePermissions } from "../auth/authorize.middleware.js";

export class MultiBranchService {

  async listBranchUsers(tenantContext, branchId) {
    await this.verifyBranch(tenantContext, branchId);
    const users = await multiBranchRepository.findBranchUsers(tenantContext, branchId);
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      roleName: u.role?.name || null,
      isHomeBranch: u.branchId === branchId,
    }));
  }

  async grantAccess(tenantContext, branchId, employeeId) {
    const branch = await this.verifyBranch(tenantContext, branchId);
    const employee = await multiBranchRepository.findEmployee(tenantContext, employeeId);
    if (!employee) {
      throw new NotFoundError("Employee not found or access denied");
    }

    if (employee.branchId === branchId) {
      throw new BusinessRuleError(`Employee is already assigned to branch '${branch.name}' as their home branch`);
    }

    const existing = await multiBranchRepository.findEmployeeAccess(tenantContext, employeeId, branchId);
    if (existing) {
      throw new ConflictError(`Employee already has access to branch '${branch.name}'`);
    }

    try {
      const access = await multiBranchRepository.grantBranchAccess(tenantContext, employeeId, branchId);

      await auditLogService.record(tenantContext, {
        actorEmployeeId: tenantContext.employeeId || null,
        action: AuditAction.BRANCH_ACCESS_GRANTED,
        entityType: "employee",
        entityId: employeeId,
        metadata: { branchId, branchName: branch.name },
      });

      return access;
    } catch (error) {
      if (error?.code === "P2002") {
        throw new ConflictError(`Employee already has access to branch '${branch.name}'`);
      }
      throw error;
    }
  }

  async revokeAccess(tenantContext, branchId, employeeId) {
    const branch = await this.verifyBranch(tenantContext, branchId);
    const employee = await multiBranchRepository.findEmployee(tenantContext, employeeId);
    if (!employee) {
      throw new NotFoundError("Employee not found or access denied");
    }

    if (employee.branchId === branchId) {
      throw new BusinessRuleError(`Cannot revoke access to branch '${branch.name}' because it is the employee's home branch`);
    }

    const count = await multiBranchRepository.revokeBranchAccess(tenantContext, employeeId, branchId);
    if (count === 0) {
      throw new NotFoundError("Employee does not have access to this branch");
    }

    await auditLogService.record(tenantContext, {
      actorEmployeeId: tenantContext.employeeId || null,
      action: AuditAction.BRANCH_ACCESS_REVOKED,
      entityType: "employee",
      entityId: employeeId,
      metadata: { branchId, branchName: branch.name },
    });

    return { message: "Branch access revoked successfully" };
  }

  async listMyBranches(tenantContext) {
    const { restaurantId, employeeId } = tenantContext;
    if (!employeeId) {
      throw new NotFoundError("Employee identity required");
    }

    let canManageAll = false;
    try {
      const { roleName, isSystem, permissions } = await getEmployeePermissions(employeeId, restaurantId);
      canManageAll = (isSystem && roleName === "owner") || permissions.includes("branches.manage");
    } catch (error) {
      if (!(error instanceof AuthorizationError)) throw error;
    }

    if (canManageAll) {
      return multiBranchRepository.findAllBranches(tenantContext);
    }

    const branches = await multiBranchRepository.findEmployeeBranches(tenantContext, employeeId);
    if (!branches) {
      throw new NotFoundError("Employee not found or access denied");
    }
    return branches;
  }

  async verifyBranch(tenantContext, branchId) {
    const branch = await multiBranchRepository.findBranch(tenantContext, branchId);
    if (!branch) {
      throw new NotFoundError("Branch not found or access denied");
    }
    return branch;
  }
}

export const multiBranchService = new MultiBranchService();
export default multiBranchService;
