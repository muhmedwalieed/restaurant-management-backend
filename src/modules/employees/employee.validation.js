import { z } from "zod";

export const employeeQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    branchId: z.string().optional(),
    search: z.string().optional(),
    status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional(),
    roleId: z.string().optional(),
    sort: z.enum(["name:asc", "name:desc", "email:asc", "email:desc", "createdAt:asc", "createdAt:desc"]).optional(),
  }),
});

export const createEmployeeSchema = z.object({
  body: z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Invalid email address"),
    phone: z.string().optional(),
    password: z.string().min(8, "Password must be at least 8 characters"),
    branchId: z.string().min(1, "branchId is required"),
    roleId: z.string().min(1, "roleId is required"),
  }),
});

export const updateEmployeeSchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    phone: z.string().optional(),
    branchId: z.string().optional(),
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().optional(),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
  }),
});

export const updateRoleSchema = z.object({
  body: z.object({
    roleId: z.string().min(1, "roleId is required"),
  }),
});
