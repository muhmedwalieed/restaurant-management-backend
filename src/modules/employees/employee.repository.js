import prisma from "../../lib/prisma.js";
import { BaseRepository, assertTenantContext, getPaginationOffset } from "../../shared/repositories/base.repository.js";

export class EmployeeRepository extends BaseRepository {
  async findEmployees(tenantContext, { page = 1, limit = 20, branchId, search, status, roleId, sort }) {
    assertTenantContext(tenantContext);
    const { skip, take } = getPaginationOffset(page, limit);

    const where = {
      restaurantId: tenantContext.restaurantId,
      deletedAt: null,
      ...(branchId ? { branchId } : {}),
      ...(status ? { status } : {}),
      ...(roleId ? { roleId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { phone: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    let orderBy = { createdAt: "desc" };
    if (sort) {
      const [field, direction] = sort.split(":");
      orderBy = { [field]: direction };
    }

    const [items, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        skip,
        take,
        orderBy,
        select: {
          id: true,
          restaurantId: true,
          branchId: true,
          roleId: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          branch: {
            select: { id: true, name: true, code: true },
          },
          role: {
            select: { id: true, name: true, isSystem: true },
          },
        },
      }),
      prisma.employee.count({ where }),
    ]);

    return { items, total };
  }

  async findEmployeeById(tenantContext, id) {
    assertTenantContext(tenantContext);

    return prisma.employee.findFirst({
      where: {
        id,
        restaurantId: tenantContext.restaurantId,
        deletedAt: null,
      },
      select: {
        id: true,
        restaurantId: true,
        branchId: true,
        roleId: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        branch: {
          select: { id: true, name: true, code: true },
        },
        role: {
          select: { id: true, name: true, isSystem: true },
        },
      },
    });
  }

  async findEmployeeByEmail(tenantContext, email) {
    assertTenantContext(tenantContext);

    return prisma.employee.findFirst({
      where: {
        restaurantId: tenantContext.restaurantId,
        email: email.toLowerCase(),
        deletedAt: null,
      },
    });
  }

  async createEmployee(tenantContext, data) {
    assertTenantContext(tenantContext);

    return prisma.employee.create({
      data: {
        ...data,
        restaurantId: tenantContext.restaurantId,
        email: data.email.toLowerCase(),
      },
      select: {
        id: true,
        restaurantId: true,
        branchId: true,
        roleId: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
      },
    });
  }

  async updateEmployee(tenantContext, id, data) {
    const existing = await this.findEmployeeById(tenantContext, id);
    if (!existing) {
      return null;
    }

    return prisma.employee.update({
      where: {
        id,
        restaurantId: tenantContext.restaurantId,
      },
      data,
      select: {
        id: true,
        restaurantId: true,
        branchId: true,
        roleId: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        updatedAt: true,
      },
    });
  }

  async updatePasswordHash(tenantContext, id, passwordHash) {
    const existing = await this.findEmployeeById(tenantContext, id);
    if (!existing) {
      return null;
    }

    return prisma.employee.update({
      where: {
        id,
        restaurantId: tenantContext.restaurantId,
      },
      data: {
        passwordHash,
        updatedAt: new Date(),
      },
    });
  }

  async updateRole(tenantContext, id, roleId) {
    const existing = await this.findEmployeeById(tenantContext, id);
    if (!existing) {
      return null;
    }

    return prisma.employee.update({
      where: {
        id,
        restaurantId: tenantContext.restaurantId,
      },
      data: {
        roleId,
        updatedAt: new Date(),
      },
    });
  }

  async softDeleteEmployee(tenantContext, id) {
    const existing = await this.findEmployeeById(tenantContext, id);
    if (!existing) {
      return null;
    }

    return prisma.$transaction([
      prisma.employee.update({
        where: {
          id,
          restaurantId: tenantContext.restaurantId,
        },
        data: {
          deletedAt: new Date(),
          status: "INACTIVE",
        },
      }),
      prisma.session.updateMany({
        where: {
          employeeId: id,
          restaurantId: tenantContext.restaurantId,
          status: "ACTIVE",
        },
        data: {
          status: "FORCE_LOGGED_OUT",
          logoutAt: new Date(),
        },
      }),
    ]);
  }
}

export const employeeRepository = new EmployeeRepository();
export default employeeRepository;
