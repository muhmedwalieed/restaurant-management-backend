import prisma from "../../lib/prisma.js";
import { AuthenticationError, NotFoundError } from "../../shared/errors/index.js";

export class RestaurantRepository {

  async findRestaurantById(tenantContext) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: {
        id: tenantContext.restaurantId,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        email: true,
        phone: true,
        description: true,
        logoUrl: true,
        currency: true,
        timezone: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            branches: true,
            employees: { where: { deletedAt: null } },
          },
        },
      },
    });

    if (!restaurant) {
      throw new NotFoundError("Restaurant not found");
    }

    return restaurant;
  }

  async updateRestaurantProfile(tenantContext, data) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    return prisma.restaurant.update({
      where: {
        id: tenantContext.restaurantId,
      },
      data,
      select: {
        id: true,
        name: true,
        slug: true,
        email: true,
        phone: true,
        description: true,
        logoUrl: true,
        currency: true,
        timezone: true,
        status: true,
        updatedAt: true,
      },
    });
  }

  async updateRestaurantStatus(tenantContext, status) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext with restaurantId is required");
    }

    return prisma.restaurant.update({
      where: {
        id: tenantContext.restaurantId,
      },
      data: {
        status,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        status: true,
        updatedAt: true,
      },
    });
  }
}

export const restaurantRepository = new RestaurantRepository();
export default restaurantRepository;
