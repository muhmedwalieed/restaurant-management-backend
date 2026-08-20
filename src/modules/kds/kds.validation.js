import { z } from "zod";

export const kdsQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
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
