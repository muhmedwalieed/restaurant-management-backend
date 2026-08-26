import { z } from "zod";
import { paginationQuerySchema } from "../../shared/validation/common.schemas.js";

const codeSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{3,50}$/, "Code must be 3-50 alphanumeric characters (letters, numbers, - or _)")
  .transform((v) => v.toUpperCase());

const isoDateOrDateTimeRegex = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;
const dateStringSchema = z.string().regex(isoDateOrDateTimeRegex, "Must be a valid date or datetime format");

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
      startsAt: dateStringSchema.optional(),
      expiresAt: dateStringSchema.optional(),
      isActive: z.boolean().optional().default(true),
      branchId: z.string().optional(),
    })
    .superRefine((data, ctx) => {
      if (data.type === "PERCENTAGE" && data.value > 100) {
        ctx.addIssue({ code: "custom", path: ["value"], message: "Percentage value cannot exceed 100" });
      }
    }),
});

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
      startsAt: dateStringSchema.nullable().optional(),
      expiresAt: dateStringSchema.nullable().optional(),
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
    ...paginationQuerySchema,
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
