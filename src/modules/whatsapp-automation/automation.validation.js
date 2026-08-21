import { z } from "zod";

export const listConversationsQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(["ACTIVE", "WAITING_AGENT", "CLOSED"]).optional(),
  }),
});
