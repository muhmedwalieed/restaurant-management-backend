import prisma from "../../lib/prisma.js";
import { NotFoundError } from "../../shared/errors/index.js";
import { getPaginationOffset } from "../../shared/utils/pagination.js";
import { assertTenantContext } from "../../shared/middleware/tenant-context.js";

export class BranchRepository {
  async findBranches(tenantContext, { page = 1, limit = 20, status } = {}) {
    assertTenantContext(tenantContext);
    const { skip, take } = getPaginationOffset(page, limit);

    const where = {
      restaurantId: tenantContext.restaurantId,
      ...(status ? { status } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.branch.findMany({
        where,
        skip,
        take,
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

  async findBranchById(tenantContext, branchId) {
    assertTenantContext(tenantContext);

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

  async requireBranch(tenantContext, branchId) {
    const branch = await this.findBranchById(tenantContext, branchId);
    if (!branch) {
      throw new NotFoundError("Branch not found or access denied");
    }
    return branch;
  }

  async findMainBranch(tenantContext) {
    assertTenantContext(tenantContext);

    return prisma.branch.findFirst({
      where: {
        restaurantId: tenantContext.restaurantId,
        isMain: true,
      },
    });
  }

  async findBranchByCode(tenantContext, code) {
    assertTenantContext(tenantContext);

    return prisma.branch.findFirst({
      where: {
        restaurantId: tenantContext.restaurantId,
        code: code.toUpperCase(),
      },
    });
  }

  async createBranch(tenantContext, branchData) {
    assertTenantContext(tenantContext);

    return prisma.branch.create({
      data: {
        ...branchData,
        restaurantId: tenantContext.restaurantId,
        code: branchData.code.toUpperCase(),
      },
    });
  }

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
            restaurantId,
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

  async upsertBranchSettings(tenantContext, branchId, { currency, timezone, dailyOrderStartNumber }) {
    const restaurantId = tenantContext.restaurantId;

    return prisma.branchSettings.upsert({
      where: {
        branchId,
      },
      update: {
        restaurantId,
        ...(currency !== undefined ? { currency } : {}),
        ...(timezone !== undefined ? { timezone } : {}),
        ...(dailyOrderStartNumber !== undefined ? { dailyOrderStartNumber } : {}),
        updatedAt: new Date(),
      },
      create: {
        restaurantId,
        branchId,
        currency: currency || null,
        timezone: timezone || null,
        dailyOrderStartNumber: dailyOrderStartNumber ?? 200,
      },
    });
  }
}

export const branchRepository = new BranchRepository();
export default branchRepository;
