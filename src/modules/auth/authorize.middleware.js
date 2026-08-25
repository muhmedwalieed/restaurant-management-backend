import { AuthorizationError } from "../../shared/errors/index.js";
import prisma from "../../lib/prisma.js";
import redis from "../../config/redis.js";
import logger from "../../config/logger.js";

export async function getEmployeePermissions(employeeId, restaurantId) {
  const cacheKey = `permissions:${employeeId}`;

  try {
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
      return JSON.parse(cachedData);
    }
  } catch (err) {
    logger.warn({ err: err.message }, "Redis read failed in getEmployeePermissions, falling back to DB");
  }

  const employee = await prisma.employee.findFirst({
    where: {
      id: employeeId,
      restaurantId,
      deletedAt: null,
      status: "ACTIVE",
    },
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
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

  const permissionData = {
    roleName,
    isSystem,
    permissions,
  };

  try {
    await redis.set(cacheKey, JSON.stringify(permissionData), "EX", 60);
  } catch (err) {
    logger.warn({ err: err.message }, "Redis set failed in getEmployeePermissions");
  }

  return permissionData;
}

export function authorizeAny(...permissionKeys) {
  return async (req, res, next) => {
    try {
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
    } catch (error) {
      next(error);
    }
  };
}

export function authorize(permissionKey) {
  return authorizeAny(permissionKey);
}

export default authorize;
