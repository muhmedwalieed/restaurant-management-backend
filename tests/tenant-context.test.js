import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { signAccessToken } from "../src/utils/jwt.js";
import { requireTenantContext, injectTenantContext } from "../src/shared/middleware/tenant-context.js";
import { AuthenticationError } from "../src/shared/errors/index.js";

describe("Tenant Context Middleware Tests", () => {
  test("requireTenantContext throws 401 AuthenticationError when Authorization header is missing", () => {
    const req = { headers: {} };
    const res = {};

    assert.throws(
      () => {
        requireTenantContext(req, res, () => {});
      },
      (err) => {
        return err instanceof AuthenticationError && err.statusCode === 401;
      }
    );
  });

  test("requireTenantContext throws 401 AuthenticationError when JWT token is invalid", () => {
    const req = {
      headers: {
        authorization: "Bearer invalid_token_123",
      },
    };
    const res = {};

    assert.throws(
      () => {
        requireTenantContext(req, res, () => {});
      },
      (err) => {
        return err instanceof AuthenticationError && err.statusCode === 401;
      }
    );
  });

  test("requireTenantContext injects req.tenantContext when valid token is provided", () => {
    const payload = {
      restaurantId: "rest_12345",
      branchId: "branch_67890",
      employeeId: "emp_111",
      role: "MANAGER",
    };

    const token = signAccessToken(payload);

    const req = {
      headers: {
        authorization: `Bearer ${token}`,
      },
    };
    const res = {};
    let nextCalled = false;

    requireTenantContext(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.notEqual(req.tenantContext, undefined);
    assert.equal(req.tenantContext.restaurantId, "rest_12345");
    assert.equal(req.tenantContext.branchId, "branch_67890");
    assert.equal(req.tenantContext.employeeId, "emp_111");
    assert.equal(req.tenantContext.role, "MANAGER");
  });

  test("injectTenantContext does not throw when token is missing, leaves req.tenantContext undefined", () => {
    const req = { headers: {} };
    const res = {};
    let nextCalled = false;

    injectTenantContext(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(req.tenantContext, undefined);
  });
});
