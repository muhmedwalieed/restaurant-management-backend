import { z } from "zod";
import { paginationQuerySchema } from "../../shared/validation/common.schemas.js";

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const branchQuerySchema = z.object({
  query: z.object({
    ...paginationQuerySchema,
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  }),
});

export const createBranchSchema = z.object({
  body: z.object({
    name: z.string().min(2, "Branch name must be at least 2 characters"),
    code: z.string().min(2, "Branch code must be at least 2 characters").max(20),
    address: z.string().optional(),
    phone: z.string().optional(),
    contactEmail: z.string().email("Invalid contact email").optional(),
    contactPhone: z.string().optional(),
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
    isMain: z.boolean().optional().default(false),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional().default("ACTIVE"),
  }),
});

export const updateBranchSchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    code: z.string().min(2).max(20).optional(),
    address: z.string().optional(),
    phone: z.string().optional(),
    contactEmail: z.string().email().optional(),
    contactPhone: z.string().optional(),
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  }),
});

export const updateWorkingHoursSchema = z.object({
  body: z.object({
    workingHours: z
      .array(
        z.object({
          day: z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]),
          openTime: z.string().regex(timeRegex, "openTime must be HH:mm format (e.g. 09:00)"),
          closeTime: z.string().regex(timeRegex, "closeTime must be HH:mm format (e.g. 23:00)"),
          isOpen: z.boolean().optional().default(true),
        })
      )
      .min(1, "At least one day schedule must be provided")
      .max(7, "Maximum 7 days working hours"),
  }),
});

export const updateBranchSettingsSchema = z.object({
  body: z.object({
    currency: z.string().min(3).max(3).optional(),
    timezone: z.string().optional(),
    dailyOrderStartNumber: z.coerce.number().int().min(1).max(99999).optional(),
  }),
});
