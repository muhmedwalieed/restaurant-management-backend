import prisma from "../../lib/prisma.js";
import { AuthenticationError, NotFoundError } from "../../shared/errors/index.js";

export class BranchRepository {
  /**
   * Lists branches for tenant with pagination and optional status filter.
   */
  async findBranches(tenantContext, { page = 1, limit = 20, status } = {}) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    const skip = (page - 1) * limit;
    const where = {
      restaurantId: tenantContext.restaurantId,
      ...(status ? { status } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.branch.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          restaurantId: true,
          name: true,
          code: true,
          address: true,
          phone: true,
          contactEmail: true,
          contactPhone: true,
          street: true,
          city: true,
          state: true,
          postalCode: true,
          status: true,
          isMain: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              employees: { where: { deletedAt: null } },
            },
          },
        },
        orderBy: [{ isMain: "desc" }, { createdAt: "asc" }],
      }),
      prisma.branch.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * Finds single branch by ID with working hours and settings.
   */
  async findBranchById(tenantContext, branchId) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    return prisma.branch.findFirst({
      where: {
        id: branchId,
        restaurantId: tenantContext.restaurantId,
      },
      include: {
        workingHours: {
          orderBy: { day: "asc" },
        },
        settings: true,
      },
    });
  }

  /**
   * Finds main branch for tenant.
   */
  async findMainBranch(tenantContext) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    return prisma.branch.findFirst({
      where: {
        restaurantId: tenantContext.restaurantId,
        isMain: true,
      },
    });
  }

  /**
   * Finds branch by code within tenant.
   */
  async findBranchByCode(tenantContext, code) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    return prisma.branch.findFirst({
      where: {
        restaurantId: tenantContext.restaurantId,
        code: code.toUpperCase(),
      },
    });
  }

  /**
   * Creates a new branch.
   */
  async createBranch(tenantContext, branchData) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    return prisma.branch.create({
      data: {
        ...branchData,
        restaurantId: tenantContext.restaurantId,
        code: branchData.code.toUpperCase(),
      },
    });
  }

  /**
   * Updates a branch (ownership verified first via findBranchById).
   */
  async updateBranch(tenantContext, branchId, data) {
    const existing = await this.findBranchById(tenantContext, branchId);
    if (!existing) {
      return null;
    }

    return prisma.branch.updateMany({
      where: {
        id: branchId,
        restaurantId: tenantContext.restaurantId,
      },
      data: {
        ...data,
        ...(data.code ? { code: data.code.toUpperCase() } : {}),
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Deactivates a branch (sets status to INACTIVE).
   */
  async deactivateBranch(tenantContext, branchId) {
    const existing = await this.findBranchById(tenantContext, branchId);
    if (!existing) {
      return null;
    }

    return prisma.branch.updateMany({
      where: {
        id: branchId,
        restaurantId: tenantContext.restaurantId,
      },
      data: {
        status: "INACTIVE",
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Hard deletes a branch (only for non-main inactive branches).
   */
  async deleteBranch(tenantContext, branchId) {
    const existing = await this.findBranchById(tenantContext, branchId);
    if (!existing) {
      return null;
    }

    return prisma.branch.deleteMany({
      where: {
        id: branchId,
        restaurantId: tenantContext.restaurantId,
      },
    });
  }

  /**
   * Gets working hours for a branch.
   */
  async getWorkingHours(tenantContext, branchId) {
    const branch = await this.findBranchById(tenantContext, branchId);
    if (!branch) {
      throw new NotFoundError("Branch not found or access denied");
    }

    return prisma.workingHours.findMany({
      where: {
        restaurantId: tenantContext.restaurantId,
        branchId,
      },
      orderBy: { day: "asc" },
    });
  }

  /**
   * Batch upserts working hours for a branch within a transaction.
   */
  async upsertWorkingHours(tenantContext, branchId, hoursArray) {
    const restaurantId = tenantContext.restaurantId;

    return prisma.$transaction(async (tx) => {
      for (const item of hoursArray) {
        await tx.workingHours.upsert({
          where: {
            branchId_day: {
              branchId,
              day: item.day,
            },
          },
          update: {
            openTime: item.openTime,
            closeTime: item.closeTime,
            isOpen: item.isOpen !== undefined ? item.isOpen : true,
            updatedAt: new Date(),
          },
          create: {
            restaurantId,
            branchId,
            day: item.day,
            openTime: item.openTime,
            closeTime: item.closeTime,
            isOpen: item.isOpen !== undefined ? item.isOpen : true,
          },
        });
      }

      return tx.workingHours.findMany({
        where: {
          restaurantId,
          branchId,
        },
        orderBy: { day: "asc" },
      });
    });
  }

  /**
   * Gets branch settings.
   */
  async getBranchSettings(tenantContext, branchId) {
    const branch = await this.findBranchById(tenantContext, branchId);
    if (!branch) {
      throw new NotFoundError("Branch not found or access denied");
    }

    return prisma.branchSettings.findFirst({
      where: {
        restaurantId: tenantContext.restaurantId,
        branchId,
      },
    });
  }

  /**
   * Upserts branch settings.
   */
  async upsertBranchSettings(tenantContext, branchId, { currency, timezone }) {
    const restaurantId = tenantContext.restaurantId;

    return prisma.branchSettings.upsert({
      where: {
        branchId,
      },
      update: {
        ...(currency !== undefined ? { currency } : {}),
        ...(timezone !== undefined ? { timezone } : {}),
        updatedAt: new Date(),
      },
      create: {
        restaurantId,
        branchId,
        currency: currency || null,
        timezone: timezone || null,
      },
    });
  }
}

export const branchRepository = new BranchRepository();
export default branchRepository;
