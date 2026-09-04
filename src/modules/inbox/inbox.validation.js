import { z } from "zod";
import { paginationQuerySchema } from "../../shared/validation/common.schemas.js";

export const inboxQuerySchema = z.object({
  query: z.object({
    ...paginationQuerySchema,
    status: z.enum(["WAITING", "ACTIVE", "PENDING", "RESOLVED", "CLOSED"]).optional(),
    ticketType: z.enum(["ORDER", "SUPPORT", "COMPLAINT", "INQUIRY"]).optional(),
    assignedToMe: z.enum(["true", "false"]).optional(),
    q: z.string().optional(),
  }),
});

export const createTicketSchema = z.object({
  body: z.object({
    customerPhone: z.string().min(3, "customerPhone is required"),
    ticketType: z.enum(["ORDER", "SUPPORT", "COMPLAINT", "INQUIRY"]).optional().default("SUPPORT"),
    subject: z.string().max(255).optional(),
    relatedOrderId: z.string().optional(),
    initialMessage: z.string().optional(),
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

export const closeTicketSchema = z.object({
  body: z.object({
    resolutionStatus: z.enum(["RESOLVED", "UNRESOLVED", "CANCELLED"]).optional().default("RESOLVED"),
    resolutionCategory: z.enum([
      "LATE_DELIVERY",
      "FOOD_QUALITY",
      "WRONG_ITEM",
      "PAYMENT_ISSUE",
      "GENERAL_INQUIRY",
      "OTHER",
    ]).optional().default("GENERAL_INQUIRY"),
    resolutionNotes: z.string().max(2000).optional().default(""),
  }),
});

export const submitFeedbackSchema = z.object({
  body: z.object({
    rating: z.number().int().min(1).max(5),
    resolved: z.boolean().optional(),
    nps: z.number().int().min(1).max(10).optional(),
    comment: z.string().max(1000).optional(),
  }),
});

export const reassignConversationSchema = z.object({
  body: z.object({
    agentId: z.string().min(1, "agentId is required"),
  }),
});
