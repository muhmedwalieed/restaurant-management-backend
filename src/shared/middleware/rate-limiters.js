import rateLimit from "express-rate-limit";
import env from "../../config/env.js";

/**
 * Creates a standardized rate limiter middleware.
 * Automatically handles test environment bypass/relaxation.
 */
export function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  max = 60,
  message = "Too many requests, please try again later",
  code = "RATE_LIMIT_EXCEEDED",
} = {}) {
  return rateLimit({
    windowMs,
    max: env.NODE_ENV === "test" ? 1000 : max,
    message: {
      success: false,
      error: {
        code,
        message,
      },
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
}

/**
 * Rate limit for authentication attempts (Login / Register)
 */
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many authentication attempts, please try again after 15 minutes",
});

/**
 * Rate limit for public online orders submission and tracking
 */
export const publicOrderRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Too many order submissions, please try again later",
});

/**
 * Rate limit for public digital menu queries
 */
export const publicMenuRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: "Too many requests, please try again after 15 minutes",
});

/**
 * Rate limit for public table menu QR queries
 */
export const publicTableRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: "Too many requests, please try again after 15 minutes",
});

/**
 * Rate limit for live table self-ordering session operations (joining, adding items, calling waiter)
 */
export const tableCustomerRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: "Too many requests",
});

/**
 * Rate limit for image file uploads
 */
export const uploadRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  message: "Too many uploads, please try again later",
});

/**
 * Rate limit for incoming WhatsApp webhooks
 */
export const webhookRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many webhook events, please try again later",
});

export default {
  createRateLimiter,
  authRateLimiter,
  publicOrderRateLimiter,
  publicMenuRateLimiter,
  publicTableRateLimiter,
  tableCustomerRateLimiter,
  uploadRateLimiter,
  webhookRateLimiter,
};
