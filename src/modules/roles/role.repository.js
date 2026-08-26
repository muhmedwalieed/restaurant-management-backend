import prisma from "../../lib/prisma.js";
import { assertTenantContext } from "../../shared/middleware/tenant-context.js";

export class RoleRepository {
  async findRoles(tenantContext) {
    assertTenantContext(tenantContext);
    return prisma.role.findMany({
      where: {
        restaurantId: tenantContext.restaurantId,
      },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
        _count: {
          select: { employees: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async findRoleById(tenantContext, id) {
    assertTenantContext(tenantContext);
    return prisma.role.findFirst({
      where: {
        id,
        restaurantId: tenantContext.restaurantId,
      },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
        _count: {
          select: { employees: true },
        },
      },
    });
  }

  async findRoleByName(tenantContext, name) {
    assertTenantContext(tenantContext);
    return prisma.role.findFirst({
      where: {
        restaurantId: tenantContext.restaurantId,
        name: name.toLowerCase(),
      },
    });
  }

  async createRole(tenantContext, { name, description, permissionKeys = [] }) {
    assertTenantContext(tenantContext);
    const restaurantId = tenantContext.restaurantId;

    return prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          restaurantId,
          name: name.toLowerCase(),
          description: description || null,
          isSystem: false,
        },
      });

      if (permissionKeys.length > 0) {
        const permissions = await tx.permission.findMany({
          where: {
            key: { in: permissionKeys },
          },
        });

        if (permissions.length > 0) {
          await tx.rolePermission.createMany({
            data: permissions.map((p) => ({
              restaurantId,
              roleId: role.id,
              permissionId: p.id,
            })),
          });
        }
      }

      return tx.role.findFirst({
        where: {
          id: role.id,
          restaurantId,
        },
        include: {
          permissions: {
            include: { permission: true },
          },
        },
      });
    });
  }

  async updateRole(tenantContext, id, { name, description, permissionKeys }) {
    assertTenantContext(tenantContext);
    const restaurantId = tenantContext.restaurantId;

    return prisma.$transaction(async (tx) => {
      if (name || description !== undefined) {
        await tx.role.update({
          where: {
            id,
            restaurantId,
          },
          data: {
            ...(name ? { name: name.toLowerCase() } : {}),
            ...(description !== undefined ? { description } : {}),
          },
        });
      }

      if (Array.isArray(permissionKeys)) {
        await tx.rolePermission.deleteMany({
          where: {
            roleId: id,
            restaurantId,
          },
        });

        if (permissionKeys.length > 0) {
          const permissions = await tx.permission.findMany({
            where: {
              key: { in: permissionKeys },
            },
          });

          if (permissions.length > 0) {
            await tx.rolePermission.createMany({
              data: permissions.map((p) => ({
                restaurantId,
                roleId: id,
                permissionId: p.id,
              })),
            });
          }
        }
      }

      return tx.role.findFirst({
        where: {
          id,
          restaurantId,
        },
        include: {
          permissions: {
            include: { permission: true },
          },
        },
      });
    });
  }

  async deleteRole(tenantContext, id) {
    assertTenantContext(tenantContext);
    return prisma.role.delete({
      where: {
        id,
        restaurantId: tenantContext.restaurantId,
      },
    });
  }

  async findAssignedEmployeeIds(tenantContext, roleId) {
    assertTenantContext(tenantContext);
    const employees = await prisma.employee.findMany({
      where: {
        restaurantId: tenantContext.restaurantId,
        roleId,
        deletedAt: null,
      },
      select: { id: true },
    });
    return employees.map((e) => e.id);
  }
}

export const roleRepository = new RoleRepository();
export default roleRepository;
