import { z } from "zod";
import { dateRangeQuerySchema } from "../../shared/validation/common.schemas.js";

const dashboardQuerySchema = z.object({
  query: z.object({
    branchId: z.string().optional(),
    ...dateRangeQuerySchema,
  }),
});

export const summaryQuerySchema = dashboardQuerySchema;
export const channelStatsQuerySchema = dashboardQuerySchema;
export const orderStatusStatsQuerySchema = dashboardQuerySchema;
export const employeePerformanceQuerySchema = dashboardQuerySchema;

export const salesTrendQuerySchema = z.object({
  query: z.object({
    branchId: z.string().optional(),
    ...dateRangeQuerySchema,
    days: z.coerce.number().int().min(1).max(365).optional().default(7),
  }),
});
