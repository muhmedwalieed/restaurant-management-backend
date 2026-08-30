import { z } from "zod";
import { paginationQuerySchema } from "../../shared/validation/common.schemas.js";

export const NOTIFICATION_TYPES = [
  "ORDER_CREATED",
  "ORDER_STATUS_CHANGED",
  "ORDER_PAID",
  "CHAT_ASSIGNED",
  "CHAT_MESSAGE",
  "SYSTEM",
];

export const listNotificationsQuerySchema = z.object({
  query: z.object({
    ...paginationQuerySchema,
    unreadOnly: z.enum(["true", "false"]).optional().transform((v) => (v === undefined ? undefined : v === "true")),
    type: z.enum(NOTIFICATION_TYPES).optional(),
  }),
});

export const preferencesSchema = z.object({
  body: z.object({
    disabledTypes: z.array(z.enum(NOTIFICATION_TYPES)).max(NOTIFICATION_TYPES.length).default([]),
  }),
});
