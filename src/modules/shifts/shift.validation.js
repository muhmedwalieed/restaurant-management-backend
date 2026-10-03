import { z } from "zod";

export const openShiftSchema = z.object({
  body: z.object({
    startingCash: z.number().min(0, "رصيد بداية الوردية لا يمكن أن يكون سالباً").default(0),
    openNotes: z.string().optional(),
  }),
});

export const closeShiftSchema = z.object({
  body: z.object({
    actualCash: z.number().min(0, "المبلغ الفعلي لا يمكن أن يكون سالباً"),
    closeNotes: z.string().optional(),
  }),
});

export const cashMovementSchema = z.object({
  body: z.object({
    type: z.enum(["CASH_IN", "CASH_OUT"]),
    amount: z.number().positive("المبلغ يجب أن يكون أكبر من صفر"),
    reason: z.string().min(2, "يرجى ذكر سبب الحركة النقدية"),
  }),
});

export const listShiftsQuerySchema = z.object({
  query: z
    .object({
      employeeId: z.string().optional(),
      status: z.enum(["OPEN", "CLOSED"]).optional(),
      fromDate: z.string().optional(),
      toDate: z.string().optional(),
      limit: z.coerce.number().optional(),
      page: z.coerce.number().optional(),
    })
    .optional()
    .default({}),
});
