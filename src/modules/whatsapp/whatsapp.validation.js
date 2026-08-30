import { z } from "zod";
import { paginationQuerySchema } from "../../shared/validation/common.schemas.js";

export const connectConnectionSchema = z.object({
  body: z.object({
    provider: z.enum(["META", "MOCK"]).optional().default("META"),
    providerAccountId: z.string().min(1, "providerAccountId is required"),
    providerPhoneNumberId: z.string().min(1, "providerPhoneNumberId is required"),
    displayName: z.string().optional(),
    apiToken: z.string().optional(),
    webhookSecret: z.string().optional(),
    verifyToken: z.string().optional(),
  }),
});

export const updateConnectionSchema = z.object({
  body: z.object({
    status: z.enum(["ACTIVE", "DISCONNECTED", "FAILED"]).optional(),
    displayName: z.string().optional(),
    providerPhoneNumberId: z.string().optional(),
    apiToken: z.string().optional(),
    webhookSecret: z.string().optional(),
    verifyToken: z.string().optional(),
  }),
});

export const sendMessageSchema = z.object({
  body: z.object({
    to: z.string().min(3).max(30, "Invalid phone number format"),
    text: z.string().min(1, "Message text is required").max(4096),
    type: z.enum(["TEXT", "MEDIA"]).optional().default("TEXT"),
  }),
});

export const listMessagesQuerySchema = z.object({
  query: z.object({
    ...paginationQuerySchema,
    direction: z.enum(["INBOUND", "OUTBOUND"]).optional(),
    status: z.enum(["PENDING", "SENT", "DELIVERED", "READ", "FAILED"]).optional(),
    q: z.string().optional(),
  }),
});
