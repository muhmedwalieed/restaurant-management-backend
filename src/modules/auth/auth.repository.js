import prisma from "../../lib/prisma.js";
import { ConflictError } from "../../shared/errors/index.js";

export class AuthRepository {

  async registerRestaurantTransaction({
    name,
    slug,
    email,
    phone,
    branchName,
    ownerName,
    ownerEmail,
    ownerPasswordHash,
  }) {
    return prisma.$transaction(async (tx) => {

      const existingSlug = await tx.restaurant.findUnique({
        where: { slug },
      });
      if (existingSlug) {
        throw new ConflictError(`Restaurant slug '${slug}' is already taken`);
      }

      const restaurant = await tx.restaurant.create({
        data: {
          name,
          slug,
          email,
          phone,
          status: "ACTIVE",
        },
      });

      const branch = await tx.branch.create({
        data: {
          restaurantId: restaurant.id,
          name: branchName || `${name} Main Branch`,
          code: "MAIN",
          isMain: true,
          status: "ACTIVE",
        },
      });

      const ownerRole = await tx.role.create({
        data: {
          restaurantId: restaurant.id,
          name: "owner",
          description: "Full system owner role with all permissions",
          isSystem: true,
        },
      });

      await tx.role.create({
        data: {
          restaurantId: restaurant.id,
          name: "manager",
          description: "Branch manager role",
          isSystem: true,
        },
      });

      const allPermissions = await tx.permission.findMany();
      if (allPermissions.length > 0) {
        await tx.rolePermission.createMany({
          data: allPermissions.map((perm) => ({
            restaurantId: restaurant.id,
            roleId: ownerRole.id,
            permissionId: perm.id,
          })),
        });
      }

      const ownerEmployee = await tx.employee.create({
        data: {
          restaurantId: restaurant.id,
          branchId: branch.id,
          roleId: ownerRole.id,
          name: ownerName,
          email: ownerEmail.toLowerCase(),
          passwordHash: ownerPasswordHash,
          status: "ACTIVE",
        },
        include: {
          role: true,
        },
      });

      return {
        restaurant,
        branch,
        employee: ownerEmployee,
      };
    });
  }

  /**
   * Login lookup is strictly tenant-scoped: a staff account only exists for the
   * restaurant whose host the login happened on. There is deliberately no
   * cross-tenant fallback — an unknown slug and an unknown email both yield null
   * so the endpoint cannot be used to probe which accounts exist.
   */
  async findEmployeeByEmailForLogin(email, restaurantSlug) {
    const restaurantId = await this.findRestaurantIdBySlug(restaurantSlug);
    if (!restaurantId) return null;

    return prisma.employee.findFirst({
      where: {
        restaurantId,
        email: email.toLowerCase(),
        deletedAt: null,
        status: "ACTIVE",
      },
      include: {
        restaurant: true,
        branch: true,
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
        branchAccesses: {
          include: {
            branch: true,
          },
        },
      },
    });
  }

  async findActiveSessionByDevice(restaurantId, employeeId, device) {
    return prisma.session.findFirst({
      where: {
        restaurantId,
        employeeId,
        device,
        status: "ACTIVE",
      },
    });
  }

  async findActiveSessionOnDifferentDevice(restaurantId, employeeId, device) {
    return prisma.session.findFirst({
      where: {
        restaurantId,
        employeeId,
        status: "ACTIVE",
        NOT: {
          device,
        },
      },
    });
  }

  async createSession({ restaurantId, employeeId, device, ipAddress, refreshTokenHash }) {
    return prisma.session.create({
      data: {
        restaurantId,
        employeeId,
        device,
        ipAddress,
        refreshTokenHash,
        status: "ACTIVE",
      },
    });
  }

  async updateSessionRefreshHash(restaurantId, sessionId, newRefreshTokenHash) {
    return prisma.session.updateMany({
      where: {
        id: sessionId,
        restaurantId,
      },
      data: {
        refreshTokenHash: newRefreshTokenHash,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Resolves the restaurant id for a tenant slug; null when there is no such
   * restaurant. The restaurant's own status is intentionally not filtered here —
   * it gates features elsewhere, not authentication.
   */
  async findRestaurantIdBySlug(slug) {
    if (!slug) return null;

    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: String(slug).toLowerCase() },
      select: { id: true },
    });

    return restaurant?.id || null;
  }

  /**
   * Sessions are always looked up inside one restaurant. The previous
   * "find any restaurant holding this refresh hash" fallback is gone: the tenant
   * is part of the token, so an unscoped lookup should never happen.
   */
  async findActiveSessionByRefreshHash(refreshTokenHash, restaurantId) {
    if (!restaurantId) {
      return null;
    }

    return prisma.session.findFirst({
      where: {
        restaurantId,
        refreshTokenHash,
        status: "ACTIVE",
      },
      include: {
        employee: {
          include: {
            role: true,
          },
        },
      },
    });
  }

  async endSession(restaurantId, sessionId) {
    return prisma.session.updateMany({
      where: {
        id: sessionId,
        restaurantId,
        status: "ACTIVE",
      },
      data: {
        status: "ENDED",
        logoutAt: new Date(),
      },
    });
  }

  async forceLogoutEmployee(restaurantId, employeeId) {
    return prisma.session.updateMany({
      where: {
        restaurantId,
        employeeId,
        status: "ACTIVE",
      },
      data: {
        status: "FORCE_LOGGED_OUT",
        logoutAt: new Date(),
      },
    });
  }
}

export const authRepository = new AuthRepository();
export default authRepository;
