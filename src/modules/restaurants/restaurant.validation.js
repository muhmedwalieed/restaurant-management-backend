import { z } from "zod";

export const updateRestaurantSchema = z.object({
  body: z.object({
    name: z.string().min(2, "Restaurant name must be at least 2 characters").optional(),
    description: z.string().optional(),
    email: z.string().email("Invalid email address").optional(),
    phone: z.string().optional(),
    logoUrl: z.string().url("Invalid logo URL format").optional(),
    currency: z.string().min(3).max(3).optional(),
    timezone: z.string().optional(),
  }),
});

export const updateRestaurantStatusSchema = z.object({
  body: z.object({
    status: z.enum(["ACTIVE", "SUSPENDED", "INACTIVE"], {
      message: "Status must be ACTIVE, SUSPENDED, or INACTIVE",
    }),
  }),
});
