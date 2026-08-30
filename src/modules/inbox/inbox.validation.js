import { z } from "zod";
import { paginationQuerySchema } from "../../shared/validation/common.schemas.js";

export const inboxQuerySchema = z.object({
  query: z.object({
    ...paginationQuerySchema,
    status: z.enum(["WAITING", "ACTIVE", "PENDING", "RESOLVED", "CLOSED"]).optional(),
    assignedToMe: z.enum(["true", "false"]).optional(),
  }),
});

export const assignConversationSchema = z.object({
  body: z.object({
    agentId: z.string().optional(),
  }),
});

export const replySchema = z.object({
  body: z.object({
    content: z.string().min(1, "Reply content is required").max(4096),
  }),
});

export const noteSchema = z.object({
  body: z.object({
    content: z.string().min(1, "Note content is required").max(4096),
  }),
});

export const reassignConversationSchema = z.object({
  body: z.object({
    agentId: z.string().min(1, "agentId is required"),
  }),
});
