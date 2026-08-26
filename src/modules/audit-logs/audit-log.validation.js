import { z } from "zod";
import { paginationQuerySchema, dateRangeQuerySchema } from "../../shared/validation/common.schemas.js";

export const listAuditLogsQuerySchema = z.object({
  query: z.object({
    ...paginationQuerySchema,
    action: z.string().max(64).optional(),
    entityType: z.string().max(64).optional(),
    entityId: z.string().max(64).optional(),
    actorEmployeeId: z.string().optional(),
    branchId: z.string().optional(),
    ...dateRangeQuerySchema,
  }),
});
