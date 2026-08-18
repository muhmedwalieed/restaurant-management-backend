import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  BusinessRuleError,
  RateLimitError,
  DatabaseError,
  ExternalServiceError,
} from "../src/shared/errors/index.js";
import { errorHandler, notFoundHandler } from "../src/middleware/error.middleware.js";

describe("AppError Hierarchy and Error Handler Tests", () => {
  test("AppError subclasses correctly set statusCode, code, and defaults", () => {
    const valErr = new ValidationError("Invalid field", { field: "email" });
    assert.equal(valErr.statusCode, 400);
    assert.equal(valErr.code, "VALIDATION_ERROR");
    assert.equal(valErr.details.field, "email");

    const authErr = new AuthenticationError();
    assert.equal(authErr.statusCode, 401);
    assert.equal(authErr.code, "AUTHENTICATION_ERROR");

    const authzErr = new AuthorizationError();
    assert.equal(authzErr.statusCode, 403);
    assert.equal(authzErr.code, "AUTHORIZATION_ERROR");

    const nfErr = new NotFoundError();
    assert.equal(nfErr.statusCode, 404);

    const conflictErr = new ConflictError();
    assert.equal(conflictErr.statusCode, 409);

    const bizErr = new BusinessRuleError();
    assert.equal(bizErr.statusCode, 422);

    const rateErr = new RateLimitError();
    assert.equal(rateErr.statusCode, 429);

    const dbErr = new DatabaseError();
    assert.equal(dbErr.statusCode, 500);

    const extErr = new ExternalServiceError("Provider down", 502);
    assert.equal(extErr.statusCode, 502);
  });

  test("errorHandler formats AppError according to Unified Response Format (Section 19.4 & 21)", () => {
    const err = new ValidationError("Email is required", { field: "email" });
    const req = { requestId: "req_test_12345" };

    let statusCode = 0;
    let jsonBody = null;

    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        jsonBody = body;
        return this;
      },
    };

    errorHandler(err, req, res, () => {});

    assert.equal(statusCode, 400);
    assert.equal(jsonBody.success, false);
    assert.equal(jsonBody.error.code, "VALIDATION_ERROR");
    assert.equal(jsonBody.error.message, "Email is required");
    assert.equal(jsonBody.error.requestId, "req_test_12345");
    assert.equal(jsonBody.error.details.field, "email");
  });

  test("notFoundHandler passes a NotFoundError to next()", () => {
    const req = { method: "GET", originalUrl: "/api/unknown" };
    let passedError = null;

    notFoundHandler(req, {}, (err) => {
      passedError = err;
    });

    assert.ok(passedError instanceof NotFoundError);
    assert.equal(passedError.statusCode, 404);
  });
});
