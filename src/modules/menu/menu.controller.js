import menuService from "./menu.service.js";
import { sendSuccess } from "../../shared/utils/response.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";

export class MenuController {
  listCategories = asyncHandler(async (req, res) => {
    const { page, limit, status } = req.query;
    const { items, pagination } = await menuService.listCategories(req.tenantContext, {
      page,
      limit,
      status,
    });
    return sendSuccess(res, { data: items, pagination });
  });

  getCategoryById = asyncHandler(async (req, res) => {
    const category = await menuService.getCategoryById(req.tenantContext, req.params.id);
    return sendSuccess(res, { data: category });
  });

  createCategory = asyncHandler(async (req, res) => {
    const category = await menuService.createCategory(req.tenantContext, req.body);
    return sendSuccess(res, {
      statusCode: 201,
      message: "Category created successfully",
      data: category,
    });
  });

  updateCategory = asyncHandler(async (req, res) => {
    const category = await menuService.updateCategory(req.tenantContext, req.params.id, req.body);
    return sendSuccess(res, {
      message: "Category updated successfully",
      data: category,
    });
  });

  deleteCategory = asyncHandler(async (req, res) => {
    const result = await menuService.deleteCategory(req.tenantContext, req.params.id);
    return sendSuccess(res, { message: result.message });
  });

  listProducts = asyncHandler(async (req, res) => {
    const { page, limit, categoryId, isAvailable, status, search } = req.query;
    const { items, pagination } = await menuService.listProducts(req.tenantContext, {
      page,
      limit,
      categoryId,
      isAvailable,
      status,
      search,
    });
    return sendSuccess(res, { data: items, pagination });
  });

  getProductById = asyncHandler(async (req, res) => {
    const product = await menuService.getProductById(req.tenantContext, req.params.id);
    return sendSuccess(res, { data: product });
  });

  createProduct = asyncHandler(async (req, res) => {
    const product = await menuService.createProduct(req.tenantContext, req.body);
    return sendSuccess(res, {
      statusCode: 201,
      message: "Product created successfully",
      data: product,
    });
  });

  updateProduct = asyncHandler(async (req, res) => {
    const product = await menuService.updateProduct(req.tenantContext, req.params.id, req.body);
    return sendSuccess(res, {
      message: "Product updated successfully",
      data: product,
    });
  });

  deleteProduct = asyncHandler(async (req, res) => {
    const result = await menuService.deleteProduct(req.tenantContext, req.params.id);
    return sendSuccess(res, { message: result.message });
  });

  listModifiers = asyncHandler(async (req, res) => {
    const modifiers = await menuService.listModifiers(req.tenantContext, req.params.id);
    return sendSuccess(res, { data: modifiers });
  });

  createModifier = asyncHandler(async (req, res) => {
    const modifier = await menuService.createModifier(req.tenantContext, req.params.id, req.body);
    return sendSuccess(res, {
      statusCode: 201,
      message: "Modifier created successfully",
      data: modifier,
    });
  });

  updateModifier = asyncHandler(async (req, res) => {
    const modifier = await menuService.updateModifier(
      req.tenantContext,
      req.params.productId,
      req.params.modifierId,
      req.body
    );
    return sendSuccess(res, {
      message: "Modifier updated successfully",
      data: modifier,
    });
  });

  deleteModifier = asyncHandler(async (req, res) => {
    const result = await menuService.deleteModifier(
      req.tenantContext,
      req.params.productId,
      req.params.modifierId
    );
    return sendSuccess(res, { message: result.message });
  });

  getPublicMenu = asyncHandler(async (req, res) => {
    const { slug: restaurantSlug, restaurantId } = req.query;
    const menu = await menuService.getPublicMenu({ restaurantSlug, restaurantId });
    return sendSuccess(res, { data: menu });
  });
}

export const menuController = new MenuController();
export default menuController;
