import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import app from "../src/app/app.js";
import prisma from "../src/lib/prisma.js";
import { authService } from "../src/modules/auth/auth.service.js";
import { disconnectRedis } from "../src/config/redis.js";

describe("Roles Module Integration & Security Tests", () => {
  let server;
  let baseUrl;
  let restaurant;
  let ownerToken;
  let customRole;

  before(async () => {
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, () => {
        const address = server.address();
        baseUrl = `http://localhost:${address.port}`;
        resolve();
      });
    });

    const reg = await authService.register({
      name: "Owner Role Test",
      email: `ownerrole-${Date.now()}@test.com`,
      password: "Password123!",
      restaurantName: "Role Test Rest",
      restaurantSlug: `role-rest-${Date.now()}`,
    });
    restaurant = reg.restaurant;

    const login = await authService.login({
      email: reg.employee.email,
      password: "Password123!",
      device: "Test-Runner-Roles",
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

test("1. Reserved System Role Names check: POST /roles with name 'owner' is rejected (409 ConflictError)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/roles`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerToken}`,
},
      body: JSON.stringify({
        name: "owner", // Reserved name!
        description: "Attempting to claim owner name",
        permissions: ["employees.view"],
      }),
    });

    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, "CONFLICT_ERROR");
  });

  test("1a. GET /api/v1/roles/permissions/catalog returns permissions grouped by module (28 keys)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/roles/permissions/catalog`, {
      headers: {
        Authorization: `Bearer ${ownerToken}`,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    const employeesModule = body.data.find((g) => g.module === "employees");
    assert.ok(employeesModule);
    assert.ok(employeesModule.permissions.some((p) => p.key === "employees.view"));
    assert.ok(employeesModule.permissions.some((p) => p.key === "employees.manage"));
    const ordersModule = body.data.find((g) => g.module === "orders");
    assert.ok(ordersModule);
    assert.ok(ordersModule.permissions.some((p) => p.key === "orders.payment"));
    const dashboardModule = body.data.find((g) => g.module === "dashboard");
    assert.ok(dashboardModule);
    assert.ok(dashboardModule.permissions.some((p) => p.key === "dashboard.view"));
    const couponsModule = body.data.find((g) => g.module === "coupons");
    assert.ok(couponsModule);
    assert.ok(couponsModule.permissions.some((p) => p.key === "coupons.manage"));
    const notificationsModule = body.data.find((g) => g.module === "notifications");
    assert.ok(notificationsModule);
    assert.ok(notificationsModule.permissions.some((p) => p.key === "notifications.view"));
    const auditModule = body.data.find((g) => g.module === "audit");
    assert.ok(auditModule);
    assert.ok(auditModule.permissions.some((p) => p.key === "audit.view"));
    const totalKeys = body.data.reduce((sum, g) => sum + g.permissions.length, 0);
    assert.equal(totalKeys, 28);
  });

  test("2. POST /api/v1/roles creates custom role with permissions (201 Created)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/roles`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        name: "Shift Supervisor",
        description: "Manages shift staff",
        permissions: ["employees.view"],
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.equal(body.data.name, "shift supervisor");
    assert.equal(body.data.isSystem, false);
    customRole = body.data;
  });

  test("2b. PATCH /api/v1/roles/:id with empty body does not crash with 500 (no-op 200)", async () => {
    const createdBefore = await prisma.role.findFirst({
      where: { restaurantId: restaurant.id, name: "shift supervisor" },
    });

    const res = await fetch(`${baseUrl}/api/v1/roles/${createdBefore.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${ownerToken}`,
      },
    });

    assert.notEqual(res.status, 500);
    const body = await res.json();
    assert.equal(body.success, true);
  });

  test("3. System Role Protection: Attempting to modify System Role 'owner' is rejected (422 BusinessRuleError)", async () => {
    const systemOwnerRole = await prisma.role.findFirst({
      where: { restaurantId: restaurant.id, name: "owner" },
    });

    const res = await fetch(`${baseUrl}/api/v1/roles/${systemOwnerRole.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        description: "Modifying system role",
      }),
    });

    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.error.code, "BUSINESS_RULE_ERROR");
  });

  test("4. DELETE /api/v1/roles/:id deletes custom role successfully", async () => {
    const res = await fetch(`${baseUrl}/api/v1/roles/${customRole.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${ownerToken}`,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
  });
});
