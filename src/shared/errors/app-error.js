/**
 * Base Application Error class.
 * All custom domain errors inherit from this class.
 */
export class AppError extends Error {
  /**
   * @param {string} message - Error message
   * @param {number} [statusCode=500] - HTTP status code
   * @param {string} [code="INTERNAL_SERVER_ERROR"] - Domain error code identifier
   * @param {boolean} [isOperational=true] - Distinguishes operational errors from system bugs
   * @param {object} [details=null] - Additional structured error details or validation issues
   */
  constructor(
    message,
    statusCode = 500,
    code = "INTERNAL_SERVER_ERROR",
    isOperational = true,
    details = null
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}
