import { AuthorizationError } from "../errors/index.js";
import prisma from "../../lib/prisma.js";
import { getEmployeePermissions } from "../../modules/auth/authorize.middleware.js";
import { asyncHandler } from "../utils/async-handler.js";

export function requireBranchAccess() {
  return asyncHandler(async (req, res, next) => {
    const branchId = req.params.branchId;
    if (!branchId) {
      return next();
    }

    const { restaurantId, employeeId } = req.tenantContext || {};
    if (!restaurantId || !employeeId) {
      throw new AuthorizationError("Tenant context required for branch access check");
    }

    const { roleName, isSystem, permissions } = await getEmployeePermissions(employeeId, restaurantId);
    if ((isSystem && roleName === "owner") || permissions.includes("branches.manage")) {
      return next();
    }

    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, restaurantId, deletedAt: null },
      select: { branchId: true },
    });

    if (employee?.branchId === branchId) {
      return next();
    }

    const extraAccess = await prisma.employeeBranchAccess.findFirst({
      where: { restaurantId, employeeId, branchId },
      select: { id: true },
    });

    if (!extraAccess) {
      throw new AuthorizationError("You do not have access to this branch");
    }

    next();
  });
}

export default requireBranchAccess;
