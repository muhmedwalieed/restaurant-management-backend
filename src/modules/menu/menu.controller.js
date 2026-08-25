import menuService from "./menu.service.js";
import { sendSuccess } from "../../shared/utils/response.js";

export class MenuController {

  async listCategories(req, res, next) {
    try {
      const query = req.validated?.query ?? req.query ?? {};
      const page = query.page ? parseInt(query.page, 10) : 1;
      const limit = query.limit ? Math.min(parseInt(query.limit, 10), 100) : 20;
      const status = query.status;

      const { items, pagination } = await menuService.listCategories(req.tenantContext, {
        page,
        limit,
        status,
      });

      return sendSuccess(res, {
        data: items,
        pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  async getCategoryById(req, res, next) {
    try {
      const category = await menuService.getCategoryById(req.tenantContext, req.params.id);
      return sendSuccess(res, {
        data: category,
      });
    } catch (error) {
      next(error);
    }
  }

  async createCategory(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body ?? {};
      const category = await menuService.createCategory(req.tenantContext, body);
      return sendSuccess(res, {
        statusCode: 201,
        message: "Category created successfully",
        data: category,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateCategory(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body ?? {};
      const category = await menuService.updateCategory(req.tenantContext, req.params.id, body);
      return sendSuccess(res, {
        message: "Category updated successfully",
        data: category,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteCategory(req, res, next) {
    try {
      const result = await menuService.deleteCategory(req.tenantContext, req.params.id);
      return sendSuccess(res, {
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  async listProducts(req, res, next) {
    try {
      const query = req.validated?.query ?? req.query ?? {};
      const page = query.page ? parseInt(query.page, 10) : 1;
      const limit = query.limit ? Math.min(parseInt(query.limit, 10), 100) : 20;

      const { items, pagination } = await menuService.listProducts(req.tenantContext, {
        page,
        limit,
        categoryId: query.categoryId,
        isAvailable: query.isAvailable,
        status: query.status,
        search: query.search,
      });

      return sendSuccess(res, {
        data: items,
        pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  async getProductById(req, res, next) {
    try {
      const product = await menuService.getProductById(req.tenantContext, req.params.id);
      return sendSuccess(res, {
        data: product,
      });
    } catch (error) {
      next(error);
    }
  }

  async createProduct(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body ?? {};
      const product = await menuService.createProduct(req.tenantContext, body);
      return sendSuccess(res, {
        statusCode: 201,
        message: "Product created successfully",
        data: product,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateProduct(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body ?? {};
      const product = await menuService.updateProduct(req.tenantContext, req.params.id, body);
      return sendSuccess(res, {
        message: "Product updated successfully",
        data: product,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteProduct(req, res, next) {
    try {
      const result = await menuService.deleteProduct(req.tenantContext, req.params.id);
      return sendSuccess(res, {
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  async listModifiers(req, res, next) {
    try {
      const modifiers = await menuService.listModifiers(req.tenantContext, req.params.id);
      return sendSuccess(res, {
        data: modifiers,
      });
    } catch (error) {
      next(error);
    }
  }

  async createModifier(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body ?? {};
      const modifier = await menuService.createModifier(req.tenantContext, req.params.id, body);
      return sendSuccess(res, {
        statusCode: 201,
        message: "Modifier created successfully",
        data: modifier,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateModifier(req, res, next) {
    try {
      const body = req.validated?.body ?? req.body ?? {};
      const modifier = await menuService.updateModifier(
        req.tenantContext,
        req.params.productId,
        req.params.modifierId,
        body
      );
      return sendSuccess(res, {
        message: "Modifier updated successfully",
        data: modifier,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteModifier(req, res, next) {
    try {
      const result = await menuService.deleteModifier(
        req.tenantContext,
        req.params.productId,
        req.params.modifierId
      );
      return sendSuccess(res, {
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  async getPublicMenu(req, res, next) {
    try {
      const query = req.validated?.query ?? req.query ?? {};
      const restaurantSlug = query.slug;
      const restaurantId = query.restaurantId;

      const menu = await menuService.getPublicMenu({ restaurantSlug, restaurantId });
      return sendSuccess(res, {
        data: menu,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const menuController = new MenuController();
export default menuController;
