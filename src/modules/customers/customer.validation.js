import { z } from "zod";

export const customerQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    q: z.string().optional(),
  }),
});

export const createCustomerSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Customer name is required").max(100),
    phone: z.string().min(3, "Valid phone number is required").max(30),
    email: z.string().email("Invalid email format").optional().or(z.literal("")),
    notes: z.string().max(500).optional(),
  }),
});

export const updateCustomerSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    phone: z.string().min(3).max(30).optional(),
    email: z.string().email("Invalid email format").optional().or(z.literal("")),
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
