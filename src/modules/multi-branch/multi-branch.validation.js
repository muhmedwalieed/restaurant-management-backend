import { z } from "zod";

export const grantBranchAccessSchema = z.object({
  body: z.object({
    employeeId: z.string().min(1, "employeeId is required"),
  }),
});

export const branchUsersQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(100),
  }),
});
