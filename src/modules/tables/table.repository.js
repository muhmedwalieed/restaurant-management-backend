import prisma from "../../lib/prisma.js";
import { assertTenantContext } from "../../shared/middleware/tenant-context.js";
import { getPaginationOffset } from "../../shared/utils/pagination.js";

export class TableRepository {
  async findTablesByBranch(tenantContext, branchId, { page = 1, limit = 20, status } = {}) {
    assertTenantContext(tenantContext);
    const { skip, take } = getPaginationOffset(page, limit);

    const where = {
      restaurantId: tenantContext.restaurantId,
      branchId,
      deletedAt: null,
      ...(status ? { status } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.restaurantTable.findMany({
        where,
        skip,
        take,
        include: {
          branch: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
        orderBy: [{ label: "asc" }, { createdAt: "asc" }],
      }),
      prisma.restaurantTable.count({ where }),
    ]);

    return { items, total };
  }

  async findTableById(tenantContext, branchId, tableId) {
    assertTenantContext(tenantContext);

    return prisma.restaurantTable.findFirst({
      where: {
        id: tableId,
        branchId,
        restaurantId: tenantContext.restaurantId,
        deletedAt: null,
      },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
            code: true,
            phone: true,
            address: true,
          },
        },
      },
    });
  }

  async findTableByLabel(tenantContext, branchId, label) {
    assertTenantContext(tenantContext);

    return prisma.restaurantTable.findFirst({
      where: {
        restaurantId: tenantContext.restaurantId,
        branchId,
        label: { equals: label, mode: "insensitive" },
        deletedAt: null,
      },
    });
  }

  async createTable(tenantContext, branchId, tableData) {
    assertTenantContext(tenantContext);

    return prisma.restaurantTable.create({
      data: {
        restaurantId: tenantContext.restaurantId,
        branchId,
        label: tableData.label,
        capacity: tableData.capacity !== undefined ? tableData.capacity : 2,
        status: tableData.status || "AVAILABLE",
        qrToken: tableData.qrToken,
      },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });
  }

  async updateTable(tenantContext, branchId, tableId, data) {
    const existing = await this.findTableById(tenantContext, branchId, tableId);
    if (!existing) {
      return null;
    }

    return prisma.restaurantTable.updateMany({
      where: {
        id: tableId,
        branchId,
        restaurantId: tenantContext.restaurantId,
      },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  }

  async softDeleteTable(tenantContext, branchId, tableId) {
    const existing = await this.findTableById(tenantContext, branchId, tableId);
    if (!existing) {
      return null;
    }

    return prisma.restaurantTable.updateMany({
      where: {
        id: tableId,
        branchId,
        restaurantId: tenantContext.restaurantId,
      },
      data: {
        status: "MAINTENANCE",
        deletedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  async updateQrToken(tenantContext, branchId, tableId, newQrToken) {
    const existing = await this.findTableById(tenantContext, branchId, tableId);
    if (!existing) {
      return null;
    }

    return prisma.restaurantTable.updateMany({
      where: {
        id: tableId,
        branchId,
        restaurantId: tenantContext.restaurantId,
      },
      data: {
        qrToken: newQrToken,
        updatedAt: new Date(),
      },
    });
  }

  async findTableByQrToken(qrToken) {
    if (!qrToken) {
      return null;
    }

    const candidateRestaurant = await prisma.restaurant.findFirst({
      where: {
        tables: {
          some: {
            qrToken,
            deletedAt: null,
          },
        },
        status: "ACTIVE",
      },
    });

    if (!candidateRestaurant) {
      return null;
    }

    return prisma.restaurantTable.findFirst({
      where: {
        restaurantId: candidateRestaurant.id,
        qrToken,
        deletedAt: null,
      },
      include: {
        branch: {
          select: {
            id: true,
            restaurantId: true,
            name: true,
            code: true,
            phone: true,
            address: true,
            street: true,
            city: true,
            status: true,
          },
        },
        restaurant: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
            description: true,
            currency: true,
            timezone: true,
            status: true,
          },
        },
      },
    });
  }
}

export const tableRepository = new TableRepository();
export default tableRepository;
