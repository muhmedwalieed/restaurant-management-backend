import prisma from "../../lib/prisma.js";
import { AuthenticationError, NotFoundError } from "../../shared/errors/index.js";

/**
 * Repository layer for Restaurants and Branches.
 * Strictly adheres to Section 12.2:
 * "No tenant-scoped query may execute without tenant context."
 */
export class RestaurantRepository {
  /**
   * Creates a new Restaurant (Tenant Root creation).
   * @param {object} data - { name, slug, email, phone }
   */
  async createRestaurant(data) {
    return prisma.restaurant.create({
      data,
    });
  }

  /**
   * Finds a Restaurant by tenant context.
   * @param {object} tenantContext - { restaurantId }
   */
  async findRestaurantById(tenantContext) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    const restaurant = await prisma.restaurant.findFirst({
      where: {
        id: tenantContext.restaurantId,
      },
    });

    if (!restaurant) {
      throw new NotFoundError("Restaurant not found");
    }

    return restaurant;
  }

  /**
   * Creates a Branch scoped to the tenant.
   * @param {object} tenantContext - { restaurantId }
   * @param {object} branchData - { name, code, address, phone, isMain }
   */
  async createBranch(tenantContext, branchData) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    return prisma.branch.create({
      data: {
        ...branchData,
        restaurantId: tenantContext.restaurantId,
      },
    });
  }

  /**
   * Finds a single Branch by ID within tenant context scope.
   * @param {object} tenantContext - { restaurantId }
   * @param {string} branchId
   */
  async findBranchById(tenantContext, branchId) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    const branch = await prisma.branch.findFirst({
      where: {
        id: branchId,
        restaurantId: tenantContext.restaurantId, // Explicit Scoping
      },
    });

    if (!branch) {
      throw new NotFoundError("Branch not found or access denied for tenant");
    }

    return branch;
  }

  /**
   * Lists all Branches belonging to the tenant.
   * @param {object} tenantContext - { restaurantId }
   */
  async findBranches(tenantContext) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    return prisma.branch.findMany({
      where: {
        restaurantId: tenantContext.restaurantId, // Explicit Scoping
      },
    });
  }

  /**
   * Deletes a Branch by ID scoped to tenant.
   * @param {object} tenantContext - { restaurantId }
   * @param {string} branchId
   */
  async deleteBranch(tenantContext, branchId) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    // Verify ownership before deletion
    await this.findBranchById(tenantContext, branchId);

    return prisma.branch.deleteMany({
      where: {
        id: branchId,
        restaurantId: tenantContext.restaurantId,
      },
    });
  }
}

export const restaurantRepository = new RestaurantRepository();
export default restaurantRepository;
