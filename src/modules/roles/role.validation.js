import { z } from "zod";

export const createRoleSchema = z.object({
  body: z.object({
    name: z.string().min(2, "Role name must be at least 2 characters"),
    description: z.string().optional(),
    permissions: z.array(z.string()).min(1, "At least one permission must be assigned to the role"),
  }),
});

export const updateRoleSchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    description: z.string().optional(),
    permissions: z.array(z.string()).optional(),
  }),
});
