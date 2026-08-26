import restaurantService from "./restaurant.service.js";
import { sendSuccess } from "../../shared/utils/response.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";

export class RestaurantController {
  getProfile = asyncHandler(async (req, res) => {
    const restaurant = await restaurantService.getRestaurantProfile(req.tenantContext);
    return sendSuccess(res, { data: restaurant });
  });

  updateProfile = asyncHandler(async (req, res) => {
    const restaurant = await restaurantService.updateRestaurantProfile(req.tenantContext, req.body);
    return sendSuccess(res, {
      message: "Restaurant profile updated successfully",
      data: restaurant,
    });
  });

  updateStatus = asyncHandler(async (req, res) => {
    const restaurant = await restaurantService.updateRestaurantStatus(req.tenantContext, req.body.status);
    return sendSuccess(res, {
      message: `Restaurant status updated to ${req.body.status}`,
      data: restaurant,
    });
  });
}

export const restaurantController = new RestaurantController();
export default restaurantController;
