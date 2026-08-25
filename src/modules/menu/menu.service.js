import menuRepository from "./menu.repository.js";
import { BusinessRuleError, ConflictError, NotFoundError } from "../../shared/errors/index.js";

export class MenuService {

  async listCategories(tenantContext, { page = 1, limit = 20, status } = {}) {
    const { items, total } = await menuRepository.findCategories(tenantContext, { page, limit, status });
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  async getCategoryById(tenantContext, categoryId) {
    const category = await menuRepository.findCategoryById(tenantContext, categoryId);
    if (!category) {
      throw new NotFoundError("Category not found or access denied");
    }
    return category;
  }

  async createCategory(tenantContext, data) {

    const existing = await menuRepository.findCategoryByName(tenantContext, data.name);
    if (existing) {
      throw new ConflictError(`Category with name '${data.name}' already exists`);
    }

    return menuRepository.createCategory(tenantContext, {
      name: data.name,
      description: data.description || null,
      sortOrder: data.sortOrder !== undefined ? data.sortOrder : 0,
      status: data.status || "ACTIVE",
    });
  }

  async updateCategory(tenantContext, categoryId, data) {
    const existing = await this.getCategoryById(tenantContext, categoryId);

    if (data.name && data.name.toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = await menuRepository.findCategoryByName(tenantContext, data.name);
      if (duplicate) {
        throw new ConflictError(`Category with name '${data.name}' already exists`);
      }
    }

    const updatePayload = {
      ...(data.name ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
      ...(data.status ? { status: data.status } : {}),
    };

    await menuRepository.updateCategory(tenantContext, categoryId, updatePayload);
    return this.getCategoryById(tenantContext, categoryId);
  }

  async deleteCategory(tenantContext, categoryId) {
    const category = await this.getCategoryById(tenantContext, categoryId);

    const nonDeletedProductsCount = await menuRepository.countNonDeletedProductsByCategoryId(tenantContext, categoryId);
    if (nonDeletedProductsCount > 0) {
      throw new BusinessRuleError("Cannot delete category containing products. Delete or reassign products first.");
    }

    await menuRepository.softDeleteCategory(tenantContext, categoryId);
    return { message: `Category '${category.name}' deleted successfully` };
  }

  async listProducts(tenantContext, { page = 1, limit = 20, categoryId, isAvailable, status, search } = {}) {
    const { items, total } = await menuRepository.findProducts(tenantContext, {
      page,
      limit,
      categoryId,
      isAvailable,
      status,
      search,
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  async getProductById(tenantContext, productId) {
    const product = await menuRepository.findProductById(tenantContext, productId);
    if (!product) {
      throw new NotFoundError("Product not found or access denied");
    }
    return product;
  }

  async createProduct(tenantContext, data) {

    const category = await menuRepository.findCategoryById(tenantContext, data.categoryId);
    if (!category) {
      throw new NotFoundError("Target category not found in this restaurant");
    }

    const existing = await menuRepository.findProductByName(tenantContext, data.name);
    if (existing) {
      throw new ConflictError(`Product with name '${data.name}' already exists`);
    }

    return menuRepository.createProduct(tenantContext, {
      categoryId: data.categoryId,
      name: data.name,
      description: data.description || null,
      price: data.price,
      imageUrl: data.imageUrl || null,
      isAvailable: data.isAvailable !== undefined ? data.isAvailable : true,
      status: data.status || "ACTIVE",
    });
  }

  async updateProduct(tenantContext, productId, data) {
    const existing = await this.getProductById(tenantContext, productId);

    if (data.categoryId && data.categoryId !== existing.categoryId) {
      const category = await menuRepository.findCategoryById(tenantContext, data.categoryId);
      if (!category) {
        throw new NotFoundError("Target category not found in this restaurant");
      }
    }

    if (data.name && data.name.toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = await menuRepository.findProductByName(tenantContext, data.name);
      if (duplicate) {
        throw new ConflictError(`Product with name '${data.name}' already exists`);
      }
    }

    const updatePayload = {
      ...(data.categoryId ? { categoryId: data.categoryId } : {}),
      ...(data.name ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.price !== undefined ? { price: data.price } : {}),
      ...(data.imageUrl !== undefined ? { imageUrl: data.imageUrl } : {}),
      ...(data.isAvailable !== undefined ? { isAvailable: Boolean(data.isAvailable) } : {}),
      ...(data.status ? { status: data.status } : {}),
    };

    await menuRepository.updateProduct(tenantContext, productId, updatePayload);
    return this.getProductById(tenantContext, productId);
  }

  async deleteProduct(tenantContext, productId) {
    const product = await this.getProductById(tenantContext, productId);
    await menuRepository.softDeleteProduct(tenantContext, productId);
    return { message: `Product '${product.name}' deleted successfully` };
  }

  async listModifiers(tenantContext, productId) {
    await this.getProductById(tenantContext, productId);
    return menuRepository.findModifiersByProductId(tenantContext, productId);
  }

  async createModifier(tenantContext, productId, data) {
    await this.getProductById(tenantContext, productId);

    return menuRepository.createModifier(tenantContext, productId, {
      name: data.name,
      priceDelta: data.priceDelta !== undefined ? data.priceDelta : 0.0,
      isRequired: Boolean(data.isRequired),
    });
  }

  async updateModifier(tenantContext, productId, modifierId, data) {
    await this.getProductById(tenantContext, productId);
    const existingMod = await menuRepository.findModifierById(tenantContext, productId, modifierId);
    if (!existingMod) {
      throw new NotFoundError("Modifier not found or access denied");
    }

    const updatePayload = {
      ...(data.name ? { name: data.name } : {}),
      ...(data.priceDelta !== undefined ? { priceDelta: data.priceDelta } : {}),
      ...(data.isRequired !== undefined ? { isRequired: Boolean(data.isRequired) } : {}),
    };

    await menuRepository.updateModifier(tenantContext, productId, modifierId, updatePayload);
    return menuRepository.findModifierById(tenantContext, productId, modifierId);
  }

  async deleteModifier(tenantContext, productId, modifierId) {
    await this.getProductById(tenantContext, productId);
    const existingMod = await menuRepository.findModifierById(tenantContext, productId, modifierId);
    if (!existingMod) {
      throw new NotFoundError("Modifier not found or access denied");
    }

    await menuRepository.softDeleteModifier(tenantContext, productId, modifierId);
    return { message: "Modifier deleted successfully" };
  }

  async getPublicMenu({ restaurantSlug, restaurantId }) {
    if (!restaurantSlug && !restaurantId) {
      throw new BusinessRuleError("Either restaurantSlug or restaurantId must be provided");
    }

    const menu = await menuRepository.getPublicMenuBySlugOrId({ restaurantSlug, restaurantId });
    if (!menu) {
      throw new NotFoundError("Restaurant menu not found or restaurant is inactive");
    }

    return menu;
  }
}

export const menuService = new MenuService();
export default menuService;
