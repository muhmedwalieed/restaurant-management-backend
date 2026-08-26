
export class AppError extends Error {

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
