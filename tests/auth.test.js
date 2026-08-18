import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import app from "../src/app/app.js";
import prisma from "../src/lib/prisma.js";
import { seedPermissions } from "../prisma/seed.js";
import { disconnectRedis } from "../src/config/redis.js";

describe("Auth Module Integration & E2E Tests", () => {
  let server;
  let baseUrl;
  let registeredOwner;
  let createdRestaurant;
  let accessToken;
  let refreshToken;

  before(async () => {
    // Seed permissions
    await seedPermissions();

    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, () => {
        const address = server.address();
        baseUrl = `http://localhost:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    // Cleanup DB
    if (createdRestaurant?.id) {
      await prisma.session.deleteMany({ where: { restaurantId: createdRestaurant.id } });
      await prisma.employeeBranchAccess.deleteMany({ where: { restaurantId: createdRestaurant.id } });
      await prisma.employee.deleteMany({ where: { restaurantId: createdRestaurant.id } });
      await prisma.rolePermission.deleteMany({ where: { restaurantId: createdRestaurant.id } });
      await prisma.role.deleteMany({ where: { restaurantId: createdRestaurant.id } });
      await prisma.branch.deleteMany({ where: { restaurantId: createdRestaurant.id } });
      await prisma.restaurant.deleteMany({ where: { id: createdRestaurant.id } });
    }

    await new Promise((resolve) => {
      server.closeAllConnections?.();
      server.close(resolve);
    });

    await disconnectRedis();
  });

  test("1. POST /api/v1/auth/register creates Restaurant, Branch, Roles and Owner Employee (201 Created)", async () => {
    const slug = `auth-test-${Date.now()}`;
    const email = `owner-${Date.now()}@authtest.com`;

    const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Owner John",
        email,
        password: "Password123!",
        restaurantName: "Auth Test Restaurant",
        restaurantSlug: slug,
        branchName: "Main Branch",
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.notEqual(body.requestId, undefined);
    assert.equal(body.data.restaurant.slug, slug);
    assert.equal(body.data.employee.email, email);
    assert.equal(body.data.employee.passwordHash, undefined); // Sensitive data omitted

    createdRestaurant = body.data.restaurant;
    registeredOwner = {
      email,
      password: "Password123!",
      id: body.data.employee.id,
    };
  });

  test("2. POST /api/v1/auth/login returns Access and Refresh Tokens (200 OK)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Device-Test-1",
      },
      body: JSON.stringify({
        email: registeredOwner.email,
        password: registeredOwner.password,
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.ok(body.data.accessToken);
    assert.ok(body.data.refreshToken);
    assert.equal(body.data.employee.passwordHash, undefined);

    accessToken = body.data.accessToken;
    refreshToken = body.data.refreshToken;
  });

  test("3. Single Active Session: Login from a different device fingerprint is rejected with 422 BusinessRuleError", async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Device-Different-2",
      },
      body: JSON.stringify({
        email: registeredOwner.email,
        password: registeredOwner.password,
      }),
    });

    assert.equal(res.status, 422);
    const body = await res.json();

    assert.equal(body.success, false);
    assert.equal(body.error.code, "BUSINESS_RULE_ERROR");
    assert.equal(body.error.details.forceLogoutRequired, true);
  });

  test("4. POST /api/v1/auth/refresh performs Token Rotation and returns new token pair", async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        refreshToken,
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.ok(body.data.accessToken);
    assert.ok(body.data.refreshToken);
    assert.notEqual(body.data.refreshToken, refreshToken); // Token rotated

    // Update active tokens
    accessToken = body.data.accessToken;
    refreshToken = body.data.refreshToken;
  });

  test("5. Reusing old/invalidated Refresh Token is rejected with 401 AuthenticationError", async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        refreshToken: "invalid_old_token_123",
      }),
    });

    assert.equal(res.status, 401);
    const body = await res.json();

    assert.equal(body.success, false);
    assert.equal(body.error.code, "AUTHENTICATION_ERROR");
  });

  test("6. POST /api/v1/auth/force-logout prevents self force-logout (422 BusinessRuleError)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/force-logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        employeeId: registeredOwner.id, // Self force logout
      }),
    });

    assert.equal(res.status, 422);
    const body = await res.json();

    assert.equal(body.success, false);
    assert.equal(body.error.code, "BUSINESS_RULE_ERROR");
  });

  test("7. POST /api/v1/auth/logout ends current session", async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.success, true);

    // Subsequent access with old token fails session active check (401)
    const protectedRes = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(protectedRes.status, 401);
  });
});
