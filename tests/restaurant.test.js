import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import app from "../src/app/app.js";
import prisma from "../src/lib/prisma.js";
import { authService } from "../src/modules/auth/auth.service.js";
import { disconnectRedis } from "../src/config/redis.js";

describe("Restaurant Module Integration Tests", () => {
  let server;
  let baseUrl;
  let restaurant;
  let ownerToken;

  before(async () => {
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, () => {
        const address = server.address();
        baseUrl = `http://localhost:${address.port}`;
        resolve();
      });
    });

    const slug = `rest-test-${Date.now()}`;
    const reg = await authService.register({
      name: "Owner Rest Test",
      email: `ownerrest-${Date.now()}@test.com`,
      password: "Password123!",
      restaurantName: "Profile Test Rest",
      restaurantSlug: slug,
    });
    restaurant = reg.restaurant;

    const login = await authService.login({
      email: reg.employee.email,
      password: "Password123!",
      device: "Test-Runner-Rest",
      ipAddress: "127.0.0.1",
    });
    ownerToken = login.accessToken;
  });

  after(async () => {
    if (restaurant?.id) {
      await prisma.session.deleteMany({ where: { restaurantId: restaurant.id } });
      await prisma.employeeBranchAccess.deleteMany({ where: { restaurantId: restaurant.id } });
      await prisma.employee.deleteMany({ where: { restaurantId: restaurant.id } });
      await prisma.rolePermission.deleteMany({ where: { restaurantId: restaurant.id } });
      await prisma.role.deleteMany({ where: { restaurantId: restaurant.id } });
      await prisma.workingHours.deleteMany({ where: { restaurantId: restaurant.id } });
      await prisma.branchSettings.deleteMany({ where: { restaurantId: restaurant.id } });
      await prisma.branch.deleteMany({ where: { restaurantId: restaurant.id } });
      await prisma.auditLog.deleteMany({ where: { restaurantId: restaurant.id } });
      await prisma.restaurant.deleteMany({ where: { id: restaurant.id } });
    }

    await new Promise((resolve) => {
      server.closeAllConnections?.();
      server.close(resolve);
    });

    await disconnectRedis();
  });

  test("1. GET /api/v1/restaurant returns restaurant profile and counts (200 OK)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/restaurant`, {
      headers: {
        Authorization: `Bearer ${ownerToken}`,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.equal(body.data.id, restaurant.id);
    assert.equal(body.data.slug, restaurant.slug);
    assert.ok(body.data._count);
    assert.equal(body.data._count.branches, 1);
  });

  test("2. PATCH /api/v1/restaurant updates profile whitelist fields", async () => {
    const res = await fetch(`${baseUrl}/api/v1/restaurant`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        description: "Best Italian Gourmet Restaurant",
        currency: "EGP",
        timezone: "Africa/Cairo",
        slug: "attempting-illegal-slug-change", // Should be ignored/immutable
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.equal(body.data.description, "Best Italian Gourmet Restaurant");
    assert.equal(body.data.currency, "EGP");
    assert.equal(body.data.timezone, "Africa/Cairo");
    assert.equal(body.data.slug, restaurant.slug); // Slug remains unchanged!
  });

  test("3. PATCH /api/v1/restaurant/status updates status to SUSPENDED", async () => {
    const res = await fetch(`${baseUrl}/api/v1/restaurant/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        status: "SUSPENDED",
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.equal(body.data.status, "SUSPENDED");
  });

  test("4. Unauthenticated GET /api/v1/restaurant returns 401 AuthenticationError", async () => {
    const res = await fetch(`${baseUrl}/api/v1/restaurant`);
    assert.equal(res.status, 401);
  });

  test("5. RBAC: Employee without restaurants.manage permission gets 403 on restaurant endpoints", async () => {
    const limitedEmail = `restlimited-${Date.now()}@test.com`;

    // Create a custom role WITHOUT restaurants.manage
    const roleRes = await fetch(`${baseUrl}/api/v1/roles`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        name: "Restaurantless Staff",
        description: "Role without restaurant management permissions",
        permissions: ["employees.view"],
      }),
    });

    assert.equal(roleRes.status, 201);
    const roleBody = await roleRes.json();

    const mainBranch = await prisma.branch.findFirst({
      where: { restaurantId: restaurant.id, isMain: true },
    });

    // Create an employee holding that limited role
    const empRes = await fetch(`${baseUrl}/api/v1/employees`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        name: "Limited Staff",
        email: limitedEmail,
        password: "Password123!",
        branchId: mainBranch.id,
        roleId: roleBody.data.id,
      }),
    });

    assert.equal(empRes.status, 201);

    const login = await authService.login({
      email: limitedEmail,
      password: "Password123!",
      device: "Test-Runner-RestLimited",
      ipAddress: "127.0.0.1",
    });

    const res = await fetch(`${baseUrl}/api/v1/restaurant`, {
      headers: {
        Authorization: `Bearer ${login.accessToken}`,
      },
    });

    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error.code, "AUTHORIZATION_ERROR");
  });
});
