import prisma from "../../lib/prisma.js";
import { AuthenticationError } from "../../shared/errors/index.js";

export class MultiBranchRepository {

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

  async findEmployeeAccess(tenantContext, employeeId, branchId) {
    this.assertTenant(tenantContext);
    return prisma.employeeBranchAccess.findFirst({
      where: { restaurantId: tenantContext.restaurantId, employeeId, branchId },
    });
  }

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

  async revokeBranchAccess(tenantContext, employeeId, branchId) {
    this.assertTenant(tenantContext);
    const result = await prisma.employeeBranchAccess.deleteMany({
      where: { restaurantId: tenantContext.restaurantId, employeeId, branchId },
    });
    return result.count;
  }

  async findEmployee(tenantContext, employeeId) {
    this.assertTenant(tenantContext);
    return prisma.employee.findFirst({
      where: { id: employeeId, restaurantId: tenantContext.restaurantId, deletedAt: null, status: "ACTIVE" },
      select: { id: true, name: true, branchId: true },
    });
  }

  async findBranch(tenantContext, branchId) {
    this.assertTenant(tenantContext);
    return prisma.branch.findFirst({
      where: { id: branchId, restaurantId: tenantContext.restaurantId },
      select: { id: true, name: true },
    });
  }

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

  async findAllBranches(tenantContext) {
    this.assertTenant(tenantContext);
    return prisma.branch.findMany({
      where: { restaurantId: tenantContext.restaurantId },
      select: { id: true, name: true, code: true, isMain: true, status: true },
      orderBy: [{ isMain: "desc" }, { name: "asc" }],
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
