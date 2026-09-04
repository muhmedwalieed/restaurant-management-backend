import { z } from "zod";
import { ALLOWED_TEMPLATE_KEYS } from "./template.constants.js";

const templatesMapSchema = z
  .record(
    z.string().refine((val) => ALLOWED_TEMPLATE_KEYS.includes(val), {
      message: "Invalid template key",
    }),
    z
      .string()
      .max(2000, "Template text cannot exceed 2000 characters")
      .nullable()
      .optional()
  )
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one template must be provided for update",
  });

export const updateTemplatesSchema = z.object({
  body: z.union([
    z.object({
      templates: templatesMapSchema,
    }),
    templatesMapSchema,
  ]),
});

export const resetTemplateSchema = z.object({
  body: z.object({
    templateKey: z
      .string()
      .refine((val) => ALLOWED_TEMPLATE_KEYS.includes(val), {
        message: "Invalid template key",
      })
      .optional()
      .nullable(),
  }),
});
