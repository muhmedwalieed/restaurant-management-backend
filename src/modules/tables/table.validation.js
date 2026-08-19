import { z } from "zod";

export const tableQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(["AVAILABLE", "OCCUPIED", "RESERVED", "MAINTENANCE"]).optional(),
  }),
});

export const createTableSchema = z.object({
  body: z.object({
    label: z.string().min(1, "Table label is required"),
    capacity: z.coerce.number().int().min(1, "Capacity must be at least 1").optional().default(2),
    status: z.enum(["AVAILABLE", "OCCUPIED", "RESERVED", "MAINTENANCE"]).optional().default("AVAILABLE"),
  }),
});

export const updateTableSchema = z.object({
  body: z.object({
    label: z.string().min(1).optional(),
    capacity: z.coerce.number().int().min(1).optional(),
    status: z.enum(["AVAILABLE", "OCCUPIED", "RESERVED", "MAINTENANCE"]).optional(),
  }),
});

export const publicTableMenuParamsSchema = z.object({
  params: z.object({
    qrToken: z.string().min(1, "QR token is required"),
  }),
});
