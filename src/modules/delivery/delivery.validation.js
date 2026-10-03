import { z } from "zod";

export const pickupOrderSchema = z.object({
  body: z
    .object({
      expectedVersion: z.number().int().optional(),
    })
    .optional()
    .default({}),
});

export const deliverOrderSchema = z.object({
  body: z
    .object({
      expectedVersion: z.number().int().optional(),
      paymentMethod: z.enum(["CASH", "CARD", "INSTAPAY", "WALLET"]).default("CASH").optional(),
    })
    .optional()
    .default({}),
});

export const failDeliverySchema = z.object({
  body: z.object({
    expectedVersion: z.number().int().optional(),
    reason: z.string().min(1, "سبب تعذر التسليم مطلوب"),
  }),
});

export const settleDriverCashSchema = z.object({
  body: z.object({
    driverEmployeeId: z.string().min(1, "معرف السائق مطلوب"),
    amount: z.number().positive("المبلغ يجب أن يكون أكبر من صفر"),
    notes: z.string().optional(),
  }),
});

