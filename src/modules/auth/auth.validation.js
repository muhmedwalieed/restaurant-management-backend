import { z } from "zod";

export const registerSchema = z.object({
  body: z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.email("Invalid email address"),
    phone: z.string().optional(),
    password: z.string().min(8, "Password must be at least 8 characters"),
    restaurantName: z.string().min(2, "Restaurant name must be at least 2 characters"),
    restaurantSlug: z.string().min(2, "Restaurant slug must be at least 2 characters").regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, numbers, and hyphens"),
    branchName: z.string().optional(),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.email("Invalid email address"),
    password: z.string().min(1, "Password is required"),
    forceLogout: z.boolean().optional().default(false),
  }),
});

export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string().optional(),
  }),
});

export const forceLogoutSchema = z.object({
  body: z.object({
    employeeId: z.string().min(1, "Target employeeId is required"),
  }),
});
