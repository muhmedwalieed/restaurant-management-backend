import { z } from "zod";

export const categoryQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  }),
});

export const createCategorySchema = z.object({
  body: z.object({
    name: z.string().min(2, "Category name must be at least 2 characters"),
    description: z.string().optional(),
    sortOrder: z.coerce.number().int().min(0).optional().default(0),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional().default("ACTIVE"),
  }),
});

export const updateCategorySchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    description: z.string().optional(),
    sortOrder: z.coerce.number().int().min(0).optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  }),
});

export const productQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    categoryId: z.string().optional(),
    isAvailable: z
      .union([z.boolean(), z.enum(["true", "false"])])
      .transform((val) => (typeof val === "string" ? val === "true" : val))
      .optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
    search: z.string().optional(),
  }),
});

export const createProductSchema = z.object({
  body: z.object({
    categoryId: z.string().min(1, "categoryId is required"),
    name: z.string().min(2, "Product name must be at least 2 characters"),
    description: z.string().optional(),
    price: z.coerce.number().positive("Price must be a positive number"),
    imageUrl: z
      .union([
        z.string().url("Invalid image URL format"),
        z.string().regex(/^\/uploads\//, "Invalid image path"),
        z.literal(""),
      ])
      .transform((val) => (val === "" ? null : val))
      .optional(),
    isAvailable: z.boolean().optional().default(true),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional().default("ACTIVE"),
  }),
});

export const updateProductSchema = z.object({
  body: z.object({
    categoryId: z.string().optional(),
    name: z.string().min(2).optional(),
    description: z.string().optional(),
    price: z.coerce.number().positive().optional(),
    imageUrl: z
      .union([
        z.string().url(),
        z.string().regex(/^\/uploads\//),
        z.literal(""),
      ])
      .transform((val) => (val === "" ? null : val))
      .optional(),
    isAvailable: z.boolean().optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  }),
});

export const createModifierSchema = z.object({
  body: z.object({
    name: z.string().min(2, "Modifier name must be at least 2 characters"),
    priceDelta: z.coerce.number().min(0, "priceDelta cannot be negative").optional().default(0),
    isRequired: z.boolean().optional().default(false),
    quantityMode: z.enum(["SINGLE", "QUANTITY"]).optional().default("SINGLE"),
    maxQuantity: z.coerce.number().int().min(1).max(99).optional(),
  }),
});

export const updateModifierSchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    priceDelta: z.coerce.number().min(0).optional(),
    isRequired: z.boolean().optional(),
    quantityMode: z.enum(["SINGLE", "QUANTITY"]).optional(),
    maxQuantity: z.coerce.number().int().min(1).max(99).optional(),
  }),
});

export const publicMenuQuerySchema = z.object({
  query: z.object({
    slug: z.string().optional(),
    restaurantId: z.string().optional(),
  }),
});
