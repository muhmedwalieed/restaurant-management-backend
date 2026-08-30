import { z } from "zod";
import { paginationQuerySchema } from "../../shared/validation/common.schemas.js";

export const kdsQuerySchema = z.object({
  query: z.object({
    ...paginationQuerySchema,
    status: z.enum(["CONFIRMED", "PREPARING"]).optional(),
  }),
});

export const kdsStatusUpdateSchema = z.object({
  body: z.object({
    newStatus: z.enum(["PENDING", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"]),
    expectedVersion: z.coerce.number().int().min(1, "expectedVersion is required for optimistic locking"),
    reason: z.string().optional(),
  }),
});
