import { AuthorizationError } from "../../shared/errors/index.js";
import prisma from "../../lib/prisma.js";
import { withCache, invalidateCacheKeys } from "../../shared/utils/cache.js";
import logger from "../../config/logger.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";

export async function getEmployeePermissions(employeeId, restaurantId) {
  const cacheKey = `permissions:${employeeId}`;

  return withCache(cacheKey, 60, async () => {
    const employee = await prisma.employee.findFirst({
      where: {
        id: employeeId,
        restaurantId,
        deletedAt: null,
        status: "ACTIVE",
      },
      select: {
        role: {
          select: {
            name: true,
            isSystem: true,
            permissions: {
              select: {
                permission: {
                  select: {
                    key: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!employee || !employee.role) {
      throw new AuthorizationError("Employee or role not found");
    }

    const roleName = employee.role.name;
    const isSystem = employee.role.isSystem;
    const permissions = employee.role.permissions.map((rp) => rp.permission.key);

    return {
      roleName,
      isSystem,
      permissions,
    };
  });
}

export function authorizeAny(...permissionKeys) {
  return asyncHandler(async (req, res, next) => {
    if (!req.tenantContext || !req.tenantContext.employeeId || !req.tenantContext.restaurantId) {
      throw new AuthorizationError("Tenant context required for authorization check");
    }

    const { employeeId, restaurantId } = req.tenantContext;
    const { roleName, isSystem, permissions } = await getEmployeePermissions(employeeId, restaurantId);

    if (isSystem && roleName === "owner") {
      return next();
    }

    const allowed = permissionKeys.some((key) => permissions.includes(key));
    if (!allowed) {
      logger.warn(
        { employeeId, requiredPermissions: permissionKeys, roleName },
        "Authorization failure: insufficient permissions"
      );
      throw new AuthorizationError(
        `One of '${permissionKeys.join("', '")}' permissions is required to perform this action`
      );
    }

    next();
  });
}

export function authorize(permissionKey) {
  return authorizeAny(permissionKey);
}

export async function invalidateEmployeePermissions(employeeIds) {
  if (!employeeIds) return;
  const ids = Array.isArray(employeeIds) ? employeeIds : [employeeIds];
  if (ids.length === 0) return;
  const keys = ids.filter(Boolean).map((id) => `permissions:${id}`);
  if (keys.length > 0) {
    await invalidateCacheKeys(...keys);
  }
}

export default authorize;

