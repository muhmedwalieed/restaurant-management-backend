import prisma from "../../lib/prisma.js";
import { NotFoundError } from "../../shared/errors/index.js";
import { BaseRepository } from "../../shared/repositories/base.repository.js";

export class RestaurantRepository extends BaseRepository {

  async findRestaurantById(tenantContext) {
    this.assertTenant(tenantContext);

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
    this.assertTenant(tenantContext);

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
    this.assertTenant(tenantContext);

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
