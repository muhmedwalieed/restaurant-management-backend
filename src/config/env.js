import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  PORT: z.coerce
    .number()
    .int()
    .positive()
    .default(5000),

  CLIENT_URL: z
    .url()
    .default("http://localhost:5173"),

  APP_URL: z
    .url()
    .default("http://localhost:5000"),

  DATABASE_URL: z
    .string()
    .min(1),

  JWT_ACCESS_SECRET: z
    .string()
    .min(32),

  JWT_REFRESH_SECRET: z
    .string()
    .min(32),

  JWT_ACCESS_EXPIRES_IN: z
    .string()
    .default("15m"),

  JWT_REFRESH_EXPIRES_IN: z
    .string()
    .default("7d"),

  REDIS_URL: z
    .string()
    .default("redis://localhost:6379"),

  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error", "fatal"])
    .default("info"),

  BCRYPT_ROUNDS: z.coerce
    .number()
    .int()
    .positive()
    .default(10),

  WHATSAPP_VERIFY_TOKEN: z
    .string()
    .min(16),

  WHATSAPP_WEBHOOK_SECRET: z
    .string()
    .min(16)
    .optional(),

  WHATSAPP_API_TOKEN: z
    .string()
    .min(1)
    .optional(),

  WHATSAPP_PHONE_NUMBER_ID: z
    .string()
    .min(1)
    .optional(),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("Invalid environment variables:");

  for (const issue of parsedEnv.error.issues) {
    console.error(`- ${issue.path.join(".")}: ${issue.message}`);
  }

  process.exit(1);
}

const env = parsedEnv.data;

export default env;
