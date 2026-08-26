import restaurantRepository from "./restaurant.repository.js";
import { NotFoundError } from "../../shared/errors/index.js";

export class RestaurantService {
  async getRestaurantProfile(tenantContext) {
    const restaurant = await restaurantRepository.findRestaurantById(tenantContext);
    if (!restaurant) {
      throw new NotFoundError("Restaurant profile not found");
    }
    return restaurant;
  }

  async updateRestaurantProfile(tenantContext, data) {
    const profile = await this.getRestaurantProfile(tenantContext);
    if (!profile) {
      throw new NotFoundError("Restaurant profile not found");
    }

    const updatePayload = {
      ...(data.name ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.email !== undefined ? { email: data.email } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(data.logoUrl !== undefined ? { logoUrl: data.logoUrl } : {}),
      ...(data.currency !== undefined ? { currency: data.currency } : {}),
      ...(data.timezone !== undefined ? { timezone: data.timezone } : {}),
    };

    return restaurantRepository.updateRestaurantProfile(tenantContext, updatePayload);
  }

  async updateRestaurantStatus(tenantContext, status) {
    const profile = await this.getRestaurantProfile(tenantContext);
    if (!profile) {
      throw new NotFoundError("Restaurant profile not found");
    }

    return restaurantRepository.updateRestaurantStatus(tenantContext, status);
  }
}

export const restaurantService = new RestaurantService();
export default restaurantService;
