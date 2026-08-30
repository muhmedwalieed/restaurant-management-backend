import { z } from "zod";
import { paginationQuerySchema } from "../../shared/validation/common.schemas.js";

export const grantBranchAccessSchema = z.object({
  body: z.object({
    employeeId: z.string().min(1, "employeeId is required"),
  }),
});

export const branchUsersQuerySchema = z.object({
  query: z.object({
    ...paginationQuerySchema,
  }),
});
