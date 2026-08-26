import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { requireTenantContext } from "../src/shared/middleware/tenant-context.js";
import { AuthenticationError } from "../src/shared/errors/index.js";

describe("Tenant Context Guard Middleware Tests", () => {
  test("requireTenantContext throws 401 AuthenticationError when req.tenantContext is missing", () => {
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

  test("requireTenantContext throws 401 AuthenticationError when restaurantId is missing in tenantContext", () => {
    const req = {
      tenantContext: {},
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

  test("requireTenantContext calls next() when valid req.tenantContext is present", () => {
    const req = {
      tenantContext: {
        restaurantId: "rest_12345",
        branchId: "branch_67890",
        employeeId: "emp_111",
        role: "MANAGER",
      },
    };
    const res = {};
    let nextCalled = false;

    requireTenantContext(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(req.tenantContext.restaurantId, "rest_12345");
  });
});
