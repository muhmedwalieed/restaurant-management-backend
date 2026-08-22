import prisma from "../../lib/prisma.js";
import { AuthenticationError } from "../../shared/errors/index.js";

export class TableRepository {
  /**
   * Finds tables for a specific branch with pagination and optional status filter.
   */
  async findTablesByBranch(tenantContext, branchId, { page = 1, limit = 20, status } = {}) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    const skip = (page - 1) * limit;
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
        take: limit,
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

  /**
   * Finds a single table by ID under a specific branch.
   */
  async findTableById(tenantContext, branchId, tableId) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

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

  /**
   * Finds a table by label in a specific branch.
   */
  async findTableByLabel(tenantContext, branchId, label) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    return prisma.restaurantTable.findFirst({
      where: {
        restaurantId: tenantContext.restaurantId,
        branchId,
        label: { equals: label, mode: "insensitive" },
        deletedAt: null,
      },
    });
  }

  /**
   * Creates a new table for a branch.
   */
  async createTable(tenantContext, branchId, tableData) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

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

  /**
   * Updates table fields (ownership verified first via findTableById).
   */
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

  /**
   * Soft deletes a table (sets deletedAt and status to MAINTENANCE).
   */
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

  /**
   * Rotates / updates QR token for a table.
   */
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

  /**
   * Finds table by QR token for public table menu resolution.
   * Scopes explicitly via candidate Restaurant lookup to satisfy Tenant Safety-Net.
   */
  async findTableByQrToken(qrToken) {
    if (!qrToken) {
      return null;
    }

    // 1. Resolve candidate restaurantId via non-tenant-scoped Restaurant root
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

    // 2. Query RestaurantTable with explicit restaurantId (Safety-Net compliant!)
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
