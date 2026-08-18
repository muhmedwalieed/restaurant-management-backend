import prisma from "../../lib/prisma.js";

export class EmployeeRepository {
  async findEmployees(tenantContext, { page = 1, limit = 20, branchId }) {
    const skip = (page - 1) * limit;

    const where = {
      restaurantId: tenantContext.restaurantId,
      deletedAt: null,
      ...(branchId ? { branchId } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        skip,
        take: limit,
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
        orderBy: { createdAt: "desc" },
      }),
      prisma.employee.count({ where }),
    ]);

    return { items, total };
  }

  async findEmployeeById(tenantContext, id) {
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
    return prisma.employee.findFirst({
      where: {
        restaurantId: tenantContext.restaurantId,
        email: email.toLowerCase(),
        deletedAt: null,
      },
    });
  }

  async createEmployee(tenantContext, data) {
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
    // Explicit tenant scoping check first
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
