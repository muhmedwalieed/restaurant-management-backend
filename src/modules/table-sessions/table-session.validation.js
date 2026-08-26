import { z } from "zod";

export const joinSessionSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(60),
    pin: z.string().length(4),
  }),
});

export const addSessionItemSchema = z.object({
  body: z.object({
    productId: z.string().min(1),
    quantity: z.coerce.number().int().min(1),
  }),
});

export const updateSessionItemSchema = z.object({
  body: z.object({
    quantity: z.coerce.number().int().min(1),
  }),
});

export const callWaiterSchema = z.object({
  body: z.object({
    requesterName: z.string().max(60).optional(),
    note: z.string().max(200).optional(),
    tableId: z.string().optional(),
    type: z.enum(["HELP", "BILL", "OTHER"]).optional(),
  }),
});

export default {
  joinSessionSchema,
  addSessionItemSchema,
  updateSessionItemSchema,
  callWaiterSchema,
};
