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

  async findEmployeeByEmailForLogin(email, restaurantSlug = null) {
    let restaurantId = null;

    if (restaurantSlug) {
      const rest = await prisma.restaurant.findUnique({
        where: { slug: restaurantSlug.toLowerCase() },
      });
      if (rest) {
        restaurantId = rest.id;
      }
    }

    if (!restaurantId) {

      const candidateRestaurant = await prisma.restaurant.findFirst({
        where: {
          employees: {
            some: {
              email: email.toLowerCase(),
              deletedAt: null,
              status: "ACTIVE",
            },
          },
        },
      });

      if (!candidateRestaurant) {
        return null;
      }
      restaurantId = candidateRestaurant.id;
    }

    return prisma.employee.findFirst({
      where: {
        restaurantId,
        email: email.toLowerCase(),
        deletedAt: null,
        status: "ACTIVE",
      },
      include: {
        restaurant: true,
        role: true,
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

  async findActiveSessionByRefreshHash(refreshTokenHash, restaurantId) {
    let targetRestaurantId = restaurantId;

    if (!targetRestaurantId) {
      const candidateRest = await prisma.restaurant.findFirst({
        where: {
          sessions: {
            some: {
              refreshTokenHash,
              status: "ACTIVE",
            },
          },
        },
      });
      if (candidateRest) {
        targetRestaurantId = candidateRest.id;
      }
    }

    if (!targetRestaurantId) {
      return null;
    }

    return prisma.session.findFirst({
      where: {
        restaurantId: targetRestaurantId,
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
