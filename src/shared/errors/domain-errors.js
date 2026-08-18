import { AppError } from "./app-error.js";

/**
 * 400 Bad Request / Validation Error
 */
export class ValidationError extends AppError {
  constructor(message = "Validation failed", details = null) {
    super(message, 400, "VALIDATION_ERROR", true, details);
  }
}

/**
 * 401 Unauthorized / Authentication Error
 */
export class AuthenticationError extends AppError {
  constructor(message = "Authentication required", details = null) {
    super(message, 401, "AUTHENTICATION_ERROR", true, details);
  }
}

/**
 * 403 Forbidden / Authorization Error
 */
export class AuthorizationError extends AppError {
  constructor(message = "Access forbidden", details = null) {
    super(message, 403, "AUTHORIZATION_ERROR", true, details);
  }
}

/**
 * 404 Not Found Error
 */
export class NotFoundError extends AppError {
  constructor(message = "Resource not found", details = null) {
    super(message, 404, "NOT_FOUND", true, details);
  }
}

/**
 * 409 Conflict Error
 */
export class ConflictError extends AppError {
  constructor(message = "Resource conflict", details = null) {
    super(message, 409, "CONFLICT_ERROR", true, details);
  }
}

/**
 * 422 Unprocessable Entity / Business Rule Violation
 */
export class BusinessRuleError extends AppError {
  constructor(message = "Business rule violation", details = null) {
    super(message, 422, "BUSINESS_RULE_ERROR", true, details);
  }
}

/**
 * 429 Too Many Requests / Rate Limit Error
 */
export class RateLimitError extends AppError {
  constructor(message = "Too many requests", details = null) {
    super(message, 429, "RATE_LIMIT_EXCEEDED", true, details);
  }
}

/**
 * 500 Internal Database Error (Details hidden in production)
 */
export class DatabaseError extends AppError {
  constructor(message = "Database operation failed", details = null) {
    super(message, 500, "DATABASE_ERROR", true, details);
  }
}

/**
 * 502 / 503 External Service Error (e.g. WhatsApp, Payment gateway down)
 */
export class ExternalServiceError extends AppError {
  constructor(message = "External service unavailable", statusCode = 502, details = null) {
    super(message, statusCode, "EXTERNAL_SERVICE_ERROR", true, details);
  }
}
