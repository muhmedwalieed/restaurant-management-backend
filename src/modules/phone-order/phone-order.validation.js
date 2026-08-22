import { z } from "zod";

export const phoneLookupSchema = z.object({
  body: z.object({
    phone: z.string().min(3, "Caller phone is required").max(30),
  }),
});

export const createPhoneOrderSchema = z.object({
  body: z.object({
    type: z.enum(["DELIVERY", "PICKUP"]).default("DELIVERY"),
    customerPhone: z.string().min(3, "Customer phone is required").max(30),
    customerName: z.string().max(100).optional(),
    items: z
      .array(
        z.object({
          productId: z.string().min(1, "Product ID is required"),
          quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
          modifierIds: z.array(z.string()).optional(),
          notes: z.string().optional(),
        })
      )
      .min(1, "Order must contain at least one item"),
    notes: z.string().optional(),
  }),
});