import { z } from "zod";

/**
 * Shared validation primitives to ensure consistency and eliminate duplication
 * across all API validation schemas.
 */

export const paginationQuerySchema = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

const isoDateOrDateTimeRegex = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;

export const dateRangeQuerySchema = {
  from: z.string().regex(isoDateOrDateTimeRegex, "from must be a valid date or datetime").optional(),
  to: z.string().regex(isoDateOrDateTimeRegex, "to must be a valid date or datetime").optional(),
};

export const cuidSchema = z.string().min(1, "ID is required");

export const phoneSchema = z.string().trim().min(3, "Valid phone number is required").max(30);

export const stringOptional = (max = 255) => z.string().trim().max(max).optional();

export const nonNegativeDecimalSchema = z.coerce.number().min(0, "Value must be positive or zero");

export default {
  paginationQuerySchema,
  dateRangeQuerySchema,
  cuidSchema,
  phoneSchema,
  stringOptional,
  nonNegativeDecimalSchema,
};
