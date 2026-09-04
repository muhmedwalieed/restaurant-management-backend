import { z } from "zod";
import { ALLOWED_TEMPLATE_KEYS } from "./template.constants.js";

const isValidTemplateKey = (val) => {
  if (ALLOWED_TEMPLATE_KEYS.includes(val)) return true;
  if (typeof val === "string" && val.startsWith("CUSTOM_") && /^[A-Z0-9_]+$/.test(val)) return true;
  return false;
};

const templatesMapSchema = z
  .record(
    z.string().refine(isValidTemplateKey, {
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
      .refine(isValidTemplateKey, {
        message: "Invalid template key",
      })
      .optional()
      .nullable(),
  }),
});

export const createTemplateSchema = z.object({
  body: z.object({
    title: z
      .string()
      .trim()
      .min(2, "عنوان القالب مطلوب (حرفين على الأقل)")
      .max(100, "عنوان القالب لا يتجاوز 100 حرف"),
    key: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_]+$/, "المفتاح يجب أن يحتوي على أحرف إنجليزية وأرقام وشرطة سفلية فقط")
      .max(50)
      .optional(),
    category: z
      .enum(["WHATSAPP_BOT", "ORDER_STATUS", "INBOX_SUPPORT", "QUICK_REPLY", "GENERAL"])
      .default("INBOX_SUPPORT"),
    description: z.string().trim().max(255).optional().nullable(),
    text: z.string().trim().min(1, "نص القالب مطلوب").max(2000, "نص القالب لا يتجاوز 2000 حرف"),
    allowedVariables: z.array(z.string().trim()).optional(),
  }),
});

export const deleteTemplateSchema = z.object({
  params: z.object({
    key: z.string().trim().min(1, "Template key is required"),
  }),
});

