import { z } from "zod";
import { paginationQuerySchema, phoneSchema } from "../../shared/validation/common.schemas.js";

export const customerQuerySchema = z.object({
  query: z.object({
    ...paginationQuerySchema,
    q: z.string().optional(),
  }),
});

export const createCustomerSchema = z.object({
  body: z
    .object({
      firstName: z.string().min(1).max(60).optional(),
      lastName: z.string().max(60).optional(),
      name: z.string().min(1).max(100).optional(),
      phone: phoneSchema,
      phones: z.array(z.string().min(3).max(30)).optional(),
      notes: z.string().max(500).optional(),
    })
    .superRefine((data, ctx) => {
      if (!data.firstName?.trim() && !data.name?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["firstName"], message: "First name is required" });
      }
    }),
});

export const updateCustomerSchema = z.object({
  body: z.object({
    firstName: z.string().min(1).max(60).optional(),
    lastName: z.string().max(60).optional(),
    name: z.string().min(1).max(100).optional(),
    phone: z.string().min(3).max(30).optional(),
    phones: z.array(z.string().min(3).max(30)).optional(),
    notes: z.string().max(500).optional(),
  }),
});

export const createAddressSchema = z.object({
  body: z.object({
    label: z.enum(["HOME", "WORK", "OTHER"]).optional().default("HOME"),
    street: z.string().max(200).optional(),
    city: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    postalCode: z.string().max(20).optional(),
    isDefault: z.boolean().optional().default(false),
  }),
});

export const updateAddressSchema = z.object({
  body: z.object({
    label: z.enum(["HOME", "WORK", "OTHER"]).optional(),
    street: z.string().max(200).optional(),
    city: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    postalCode: z.string().max(20).optional(),
    isDefault: z.boolean().optional(),
  }),
});
