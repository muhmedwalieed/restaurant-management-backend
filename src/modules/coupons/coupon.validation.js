import { z } from "zod";

const codeSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{3,50}$/, "Code must be 3-50 alphanumeric characters (letters, numbers, - or _)")
  .transform((v) => v.toUpperCase());

export const createCouponSchema = z.object({
  body: z
    .object({
      code: codeSchema,
      type: z.enum(["PERCENTAGE", "FIXED"]).optional().default("PERCENTAGE"),
      value: z.coerce.number().positive("Value must be positive"),
      minSubtotal: z.coerce.number().min(0).optional().default(0),
      maxDiscount: z.coerce.number().positive().optional(),
      applicableProductIds: z.array(z.string().min(1)).optional(),
      usageLimit: z.coerce.number().int().positive().optional(),
      startsAt: z.string().datetime({ offset: true }).optional(),
      expiresAt: z.string().datetime({ offset: true }).optional(),
      isActive: z.boolean().optional().default(true),
      branchId: z.string().optional(),
    })
    .superRefine((data, ctx) => {
      if (data.type === "PERCENTAGE" && data.value > 100) {
        ctx.addIssue({ code: "custom", path: ["value"], message: "Percentage value cannot exceed 100" });
      }
    }),
});

// Update schema has NO `.default()` on any field so a partial PATCH only applies
// what was actually sent (a missing `type`/`minSubtotal`/`isActive` must NOT reset them).
export const updateCouponSchema = z.object({
  body: z
    .object({
      code: codeSchema.optional(),
      type: z.enum(["PERCENTAGE", "FIXED"]).optional(),
      value: z.coerce.number().positive("Value must be positive").optional(),
      minSubtotal: z.coerce.number().min(0).optional(),
      maxDiscount: z.coerce.number().positive().nullable().optional(),
      applicableProductIds: z.array(z.string().min(1)).nullable().optional(),
      usageLimit: z.coerce.number().int().positive().nullable().optional(),
      startsAt: z.string().datetime({ offset: true }).nullable().optional(),
      expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
      isActive: z.boolean().optional(),
      branchId: z.string().nullable().optional(),
    })
    .superRefine((data, ctx) => {
      if (data.type === "PERCENTAGE" && data.value !== undefined && data.value > 100) {
        ctx.addIssue({ code: "custom", path: ["value"], message: "Percentage value cannot exceed 100" });
      }
    }),
});

export const couponQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    isActive: z.enum(["true", "false"]).optional().transform((v) => (v === undefined ? undefined : v === "true")),
    type: z.enum(["PERCENTAGE", "FIXED"]).optional(),
    q: z.string().optional(),
  }),
});

export const validateCouponSchema = z.object({
  body: z.object({
    code: z.string().min(3).max(50),
    subtotal: z.coerce.number().min(0).default(0),
    items: z.array(z.object({ productId: z.string().min(1), subtotal: z.coerce.number().min(0) })).min(1, "At least one item is required"),
  }),
});