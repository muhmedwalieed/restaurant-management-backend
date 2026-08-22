import prisma from "../../lib/prisma.js";
import { AuthenticationError } from "../../shared/errors/index.js";

export class MultiBranchRepository {
  /**
   * Employees who can operate in a branch: their home branch matches, OR they were
   * explicitly granted access via EmployeeBranchAccess (Module 19 — Branch users).
   */
  async findBranchUsers(tenantContext, branchId) {
    this.assertTenant(tenantContext);
    return prisma.employee.findMany({
      where: {
        restaurantId: tenantContext.restaurantId,
        deletedAt: null,
        status: "ACTIVE",
        OR: [{ branchId }, { branchAccesses: { some: { branchId } } }],
      },
      select: {
        id: true,
        name: true,
        email: true,
        branchId: true,
        role: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    });
  }

  /**
   * Existing EmployeeBranchAccess row for an employee+branch.
   */
  async findEmployeeAccess(tenantContext, employeeId, branchId) {
    this.assertTenant(tenantContext);
    return prisma.employeeBranchAccess.findFirst({
      where: { restaurantId: tenantContext.restaurantId, employeeId, branchId },
    });
  }

  /**
   * Grants an employee access to an additional branch.
   */
  async grantBranchAccess(tenantContext, employeeId, branchId) {
    this.assertTenant(tenantContext);
    return prisma.employeeBranchAccess.create({
      data: {
        restaurantId: tenantContext.restaurantId,
        employeeId,
        branchId,
      },
    });
  }

  /**
   * Revokes an employee's access to a branch (removes the EmployeeBranchAccess row).
   */
  async revokeBranchAccess(tenantContext, employeeId, branchId) {
    this.assertTenant(tenantContext);
    const result = await prisma.employeeBranchAccess.deleteMany({
      where: { restaurantId: tenantContext.restaurantId, employeeId, branchId },
    });
    return result.count;
  }

  /**
   * Finds an employee within the tenant (for grant/revoke validation).
   */
  async findEmployee(tenantContext, employeeId) {
    this.assertTenant(tenantContext);
    return prisma.employee.findFirst({
      where: { id: employeeId, restaurantId: tenantContext.restaurantId, deletedAt: null, status: "ACTIVE" },
      select: { id: true, name: true, branchId: true },
    });
  }

  /**
   * Finds a branch within the tenant.
   */
  async findBranch(tenantContext, branchId) {
    this.assertTenant(tenantContext);
    return prisma.branch.findFirst({
      where: { id: branchId, restaurantId: tenantContext.restaurantId },
      select: { id: true, name: true },
    });
  }

  /**
   * All branches an employee can access (home branch + granted access) — the branch switcher.
   */
  async findEmployeeBranches(tenantContext, employeeId) {
    this.assertTenant(tenantContext);
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, restaurantId: tenantContext.restaurantId, deletedAt: null },
      select: { branchId: true },
    });
    if (!employee) return null;

    const assigned = await prisma.employeeBranchAccess.findMany({
      where: { restaurantId: tenantContext.restaurantId, employeeId },
      select: { branchId: true },
    });

    const branchIds = [employee.branchId, ...assigned.map((a) => a.branchId)];
    return prisma.branch.findMany({
      where: { restaurantId: tenantContext.restaurantId, id: { in: branchIds } },
      select: { id: true, name: true, code: true, isMain: true, status: true },
      orderBy: { name: "asc" },
    });
  }

  assertTenant(tenantContext) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }
  }
}

export const multiBranchRepository = new MultiBranchRepository();
export default multiBranchRepository;