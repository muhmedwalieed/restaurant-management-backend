import { AppError, NotFoundError } from "../shared/errors/index.js";
import { ZodError } from "zod";
import logger from "../config/logger.js";
import env from "../config/env.js";

/**
 * 404 Handler for undefined routes.
 */
const notFoundHandler = (req, res, next) => {
  const error = new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`);
  next(error);
};

/**
 * Global Centralized Error Handler Middleware.
 */
const errorHandler = (err, req, res, next) => {
  const requestId = req?.requestId || req?.id || "N/A";
  const log = req?.log || logger;

  let statusCode = 500;
  let code = "INTERNAL_SERVER_ERROR";
  let message = "Internal server error";
  let details = null;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details || null;
  } else if (err instanceof ZodError) {
    statusCode = 400;
    code = "VALIDATION_ERROR";
    message = "Invalid request data";
    details = err.issues.map((issue) => ({
      field: issue.path.join("."),
      code: issue.code,
      message: issue.message,
    }));
  } else if (err.name === "SyntaxError" && err.status === 400 && "body" in err) {
    statusCode = 400;
    code = "INVALID_JSON";
    message = "Malformed JSON payload in request body";
  }

  // Log error using Pino
  if (statusCode >= 500) {
    log.error({ err, requestId }, `[500 Server Error]: ${err.message}`);
  } else {
    log.warn({ errMessage: err.message, statusCode, code, requestId }, `[${statusCode} Client Error]: ${err.message}`);
  }

  // Hide 500 error details in production to prevent leaking internal stack traces or DB details
  if (statusCode === 500 && env.NODE_ENV === "production") {
    message = "Internal server error";
    details = null;
  }

  const responseBody = {
    success: false,
    error: {
      code,
      message,
      requestId,
      ...(details ? { details } : {}),
    },
  };

  res.status(statusCode).json(responseBody);
};

export { notFoundHandler, errorHandler };