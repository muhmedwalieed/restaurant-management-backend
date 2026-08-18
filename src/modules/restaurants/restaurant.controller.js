import restaurantService from "./restaurant.service.js";
import { sendSuccess } from "../../shared/utils/response.js";

export class RestaurantController {
  async getProfile(req, res, next) {
    try {
      const restaurant = await restaurantService.getRestaurantProfile(req.tenantContext);
      return sendSuccess(res, {
        data: restaurant,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateProfile(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body ?? {};
      const restaurant = await restaurantService.updateRestaurantProfile(req.tenantContext, body);
      return sendSuccess(res, {
        message: "Restaurant profile updated successfully",
        data: restaurant,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateStatus(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body ?? {};
      const restaurant = await restaurantService.updateRestaurantStatus(req.tenantContext, body.status);
      return sendSuccess(res, {
        message: `Restaurant status updated to ${body.status}`,
        data: restaurant,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const restaurantController = new RestaurantController();
export default restaurantController;
