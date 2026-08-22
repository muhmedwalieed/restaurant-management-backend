import { z } from "zod";

const dashboardQuerySchema = z.object({
  query: z.object({
    branchId: z.string().optional(),
    from: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from must be YYYY-MM-DD")),
    to: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to must be YYYY-MM-DD")),
  }),
});

export const summaryQuerySchema = dashboardQuerySchema;
export const channelStatsQuerySchema = dashboardQuerySchema;
export const orderStatusStatsQuerySchema = dashboardQuerySchema;
export const employeePerformanceQuerySchema = dashboardQuerySchema;

export const salesTrendQuerySchema = z.object({
  query: z.object({
    branchId: z.string().optional(),
    from: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from must be YYYY-MM-DD")),
    to: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to must be YYYY-MM-DD")),
    days: z.coerce.number().int().min(1).max(365).optional().default(7),
  }),
});