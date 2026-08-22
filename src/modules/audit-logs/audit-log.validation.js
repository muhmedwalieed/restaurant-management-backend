import { z } from "zod";

export const listAuditLogsQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    action: z.string().max(64).optional(),
    entityType: z.string().max(64).optional(),
    entityId: z.string().max(64).optional(),
    actorEmployeeId: z.string().optional(),
    branchId: z.string().optional(),
    from: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from must be YYYY-MM-DD")),
    to: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to must be YYYY-MM-DD")),
  }),
});