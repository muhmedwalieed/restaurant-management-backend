import prisma from "../../lib/prisma.js";
import { assertTenantContext } from "../../shared/middleware/tenant-context.js";
import { getPaginationOffset } from "../../shared/utils/pagination.js";

export class MenuRepository {
  async findCategories(tenantContext, { page = 1, limit = 20, status } = {}) {
    assertTenantContext(tenantContext);
    const { skip, take } = getPaginationOffset(page, limit);

    const where = {
      restaurantId: tenantContext.restaurantId,
      deletedAt: null,
      ...(status ? { status } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.category.findMany({
        where,
        skip,
        take,
        select: {
          id: true,
          restaurantId: true,
          name: true,
          description: true,
          sortOrder: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              products: {
                where: { deletedAt: null },
              },
            },
          },
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
      prisma.category.count({ where }),
    ]);

    return { items, total };
  }

  async findCategoryById(tenantContext, categoryId) {
    assertTenantContext(tenantContext);

    return prisma.category.findFirst({
      where: {
        id: categoryId,
        restaurantId: tenantContext.restaurantId,
        deletedAt: null,
      },
      include: {
        _count: {
          select: {
            products: {
              where: { deletedAt: null },
            },
          },
        },
      },
    });
  }

  async findCategoryByName(tenantContext, name) {
    assertTenantContext(tenantContext);

    return prisma.category.findFirst({
      where: {
        restaurantId: tenantContext.restaurantId,
        name: { equals: name, mode: "insensitive" },
        deletedAt: null,
      },
    });
  }

  async createCategory(tenantContext, categoryData) {
    assertTenantContext(tenantContext);

    return prisma.category.create({
      data: {
        restaurantId: tenantContext.restaurantId,
        name: categoryData.name,
        description: categoryData.description || null,
        sortOrder: categoryData.sortOrder !== undefined ? categoryData.sortOrder : 0,
        status: categoryData.status || "ACTIVE",
      },
    });
  }

  async updateCategory(tenantContext, categoryId, data) {
    const existing = await this.findCategoryById(tenantContext, categoryId);
    if (!existing) {
      return null;
    }

    return prisma.category.updateMany({
      where: {
        id: categoryId,
        restaurantId: tenantContext.restaurantId,
      },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  }

  async softDeleteCategory(tenantContext, categoryId) {
    const existing = await this.findCategoryById(tenantContext, categoryId);
    if (!existing) {
      return null;
    }

    return prisma.category.updateMany({
      where: {
        id: categoryId,
        restaurantId: tenantContext.restaurantId,
      },
      data: {
        status: "INACTIVE",
        deletedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  async countNonDeletedProductsByCategoryId(tenantContext, categoryId) {
    assertTenantContext(tenantContext);

    return prisma.product.count({
      where: {
        restaurantId: tenantContext.restaurantId,
        categoryId,
        deletedAt: null,
      },
    });
  }

  async findProducts(tenantContext, { page = 1, limit = 20, categoryId, isAvailable, status, search } = {}) {
    assertTenantContext(tenantContext);
    const { skip, take } = getPaginationOffset(page, limit);

    const where = {
      restaurantId: tenantContext.restaurantId,
      deletedAt: null,
      ...(categoryId ? { categoryId } : {}),
      ...(isAvailable !== undefined ? { isAvailable: Boolean(isAvailable) } : {}),
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take,
        include: {
          category: {
            select: {
              id: true,
              name: true,
            },
          },
          modifiers: {
            where: { deletedAt: null },
            select: {
              id: true,
              name: true,
              priceDelta: true,
              isRequired: true,
              quantityMode: true,
              maxQuantity: true,
            },
          },
        },
        orderBy: [{ category: { sortOrder: "asc" } }, { createdAt: "asc" }],
      }),
      prisma.product.count({ where }),
    ]);

    return { items, total };
  }

  async findProductById(tenantContext, productId) {
    assertTenantContext(tenantContext);

    return prisma.product.findFirst({
      where: {
        id: productId,
        restaurantId: tenantContext.restaurantId,
        deletedAt: null,
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        modifiers: {
          where: { deletedAt: null },
          orderBy: { createdAt: "asc" },
        },
      },
    });
  }

  async findProductByName(tenantContext, name) {
    assertTenantContext(tenantContext);

    return prisma.product.findFirst({
      where: {
        restaurantId: tenantContext.restaurantId,
        name: { equals: name, mode: "insensitive" },
        deletedAt: null,
      },
    });
  }

  async createProduct(tenantContext, productData) {
    assertTenantContext(tenantContext);

    return prisma.product.create({
      data: {
        restaurantId: tenantContext.restaurantId,
        categoryId: productData.categoryId,
        name: productData.name,
        description: productData.description || null,
        price: productData.price,
        imageUrl: productData.imageUrl || null,
        isAvailable: productData.isAvailable !== undefined ? productData.isAvailable : true,
        status: productData.status || "ACTIVE",
      },
      include: {
        category: {
          select: { id: true, name: true },
        },
      },
    });
  }

  async updateProduct(tenantContext, productId, data) {
    const existing = await this.findProductById(tenantContext, productId);
    if (!existing) {
      return null;
    }

    return prisma.product.updateMany({
      where: {
        id: productId,
        restaurantId: tenantContext.restaurantId,
      },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  }

  async softDeleteProduct(tenantContext, productId) {
    const existing = await this.findProductById(tenantContext, productId);
    if (!existing) {
      return null;
    }

    return prisma.product.updateMany({
      where: {
        id: productId,
        restaurantId: tenantContext.restaurantId,
      },
      data: {
        status: "INACTIVE",
        isAvailable: false,
        deletedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  async findModifiersByProductId(tenantContext, productId) {
    const product = await this.findProductById(tenantContext, productId);
    if (!product) {
      return [];
    }

    return prisma.productModifier.findMany({
      where: {
        restaurantId: tenantContext.restaurantId,
        productId,
        deletedAt: null,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async findModifierById(tenantContext, productId, modifierId) {
    const product = await this.findProductById(tenantContext, productId);
    if (!product) {
      return null;
    }

    return prisma.productModifier.findFirst({
      where: {
        id: modifierId,
        restaurantId: tenantContext.restaurantId,
        productId,
        deletedAt: null,
      },
    });
  }

  async createModifier(tenantContext, productId, data) {
    const product = await this.findProductById(tenantContext, productId);
    if (!product) {
      return null;
    }

    return prisma.productModifier.create({
      data: {
        restaurantId: tenantContext.restaurantId,
        productId,
        name: data.name,
        priceDelta: data.priceDelta !== undefined ? data.priceDelta : 0.0,
        isRequired: Boolean(data.isRequired),
        quantityMode: data.quantityMode || "SINGLE",
        maxQuantity: data.maxQuantity ?? 10,
      },
    });
  }

  async updateModifier(tenantContext, productId, modifierId, data) {
    const existing = await this.findModifierById(tenantContext, productId, modifierId);
    if (!existing) {
      return null;
    }

    return prisma.productModifier.updateMany({
      where: {
        id: modifierId,
        restaurantId: tenantContext.restaurantId,
        productId,
      },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  }

  async softDeleteModifier(tenantContext, productId, modifierId) {
    const existing = await this.findModifierById(tenantContext, productId, modifierId);
    if (!existing) {
      return null;
    }

    return prisma.productModifier.updateMany({
      where: {
        id: modifierId,
        restaurantId: tenantContext.restaurantId,
        productId,
      },
      data: {
        deletedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  async getPublicMenuBySlugOrId({ restaurantSlug, restaurantId }) {
    const restaurantWhere = restaurantId
      ? { id: restaurantId, status: "ACTIVE" }
      : { slug: restaurantSlug, status: "ACTIVE" };

    const restaurant = await prisma.restaurant.findFirst({
      where: restaurantWhere,
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        description: true,
        currency: true,
        timezone: true,
      },
    });

    if (!restaurant) {
      return null;
    }

    const categories = await prisma.category.findMany({
      where: {
        restaurantId: restaurant.id,
        status: "ACTIVE",
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        description: true,
        sortOrder: true,
        products: {
          where: {
            status: "ACTIVE",
            isAvailable: true,
            deletedAt: null,
          },
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            imageUrl: true,
            isAvailable: true,
            modifiers: {
              where: { deletedAt: null },
              select: {
                id: true,
                name: true,
                priceDelta: true,
                isRequired: true,
              },
              orderBy: { createdAt: "asc" },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });

    return {
      restaurant,
      categories,
    };
  }
}

export const menuRepository = new MenuRepository();
export default menuRepository;
