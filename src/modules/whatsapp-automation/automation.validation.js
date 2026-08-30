import { z } from "zod";
import { paginationQuerySchema } from "../../shared/validation/common.schemas.js";

export const listConversationsQuerySchema = z.object({
  query: z.object({
    ...paginationQuerySchema,
    status: z.enum(["ACTIVE", "WAITING_AGENT", "CLOSED"]).optional(),
  }),
});
