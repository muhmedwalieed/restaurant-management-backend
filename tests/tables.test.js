import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import bcrypt from "bcrypt";
import app from "../src/app/app.js";
import prisma from "../src/lib/prisma.js";
import { authService } from "../src/modules/auth/auth.service.js";
import { disconnectRedis } from "../src/config/redis.js";

describe("Tables & QR Module Integration Tests", () => {
  let server;
  let baseUrl;

  let tenantA;
  let mainBranchA;
  let secondaryBranchA;
  let ownerAToken;
  let staffAToken;

  let tenantB;
  let mainBranchB;
  let ownerBToken;

  let tableA1;
  let tableA2;
  let initialQrToken;

  before(async () => {
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, () => {
        const address = server.address();
        baseUrl = `http://localhost:${address.port}`;
        resolve();
      });
    });

    const regA = await authService.register({
      name: "Owner Table A",
      email: `ownertablea-${Date.now()}@test.com`,
      password: "Password123!",
      restaurantName: "Table Rest A",
      restaurantSlug: `table-rest-a-${Date.now()}`,
    });
    tenantA = regA.restaurant;

    mainBranchA = await prisma.branch.findFirst({
      where: { restaurantId: tenantA.id, isMain: true },
    });

    secondaryBranchA = await prisma.branch.create({
      data: {
        restaurantId: tenantA.id,
        name: "Branch A Secondary",
        code: `SEC-${Date.now()}`,
      },
    });

    const loginA = await authService.login({
      email: regA.employee.email,
      password: "Password123!",
      device: "Test-Runner-TableA",
      ipAddress: "127.0.0.1",
    });
    ownerAToken = loginA.accessToken;

    const noTablesRole = await prisma.role.create({
      data: {
        restaurantId: tenantA.id,
        name: "No Tables Staff",
        description: "Staff without tables management",
      },
    });

    const passwordHash = await bcrypt.hash("Password123!", 10);
    const staffEmp = await prisma.employee.create({
      data: {
        restaurantId: tenantA.id,
        branchId: mainBranchA.id,
        roleId: noTablesRole.id,
        name: "Staff No Tables",
        email: `staffnotables-${Date.now()}@test.com`,
        passwordHash,
      },
    });

    const staffLogin = await authService.login({
      email: staffEmp.email,
      password: "Password123!",
      device: "Test-Runner-StaffNoTables",
      ipAddress: "127.0.0.1",
    });
    staffAToken = staffLogin.accessToken;

    const regB = await authService.register({
      name: "Owner Table B",
      email: `ownertableb-${Date.now()}@test.com`,
      password: "Password123!",
      restaurantName: "Table Rest B",
      restaurantSlug: `table-rest-b-${Date.now()}`,
    });
    tenantB = regB.restaurant;
    mainBranchB = await prisma.branch.findFirst({
      where: { restaurantId: tenantB.id, isMain: true },
    });

    const loginB = await authService.login({
      email: regB.employee.email,
      password: "Password123!",
      device: "Test-Runner-TableB",
      ipAddress: "127.0.0.1",
    });
    ownerBToken = loginB.accessToken;

    const category = await prisma.category.create({
      data: {
        restaurantId: tenantA.id,
        name: "Test Category A",
      },
    });

    await prisma.product.create({
      data: {
        restaurantId: tenantA.id,
        categoryId: category.id,
        name: "Test Burger A",
        price: 12.5,
      },
    });
  });

  after(async () => {
    const ids = [tenantA?.id, tenantB?.id].filter(Boolean);
    if (ids.length > 0) {
      await prisma.restaurantTable.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.productModifier.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.product.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.category.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.session.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.employeeBranchAccess.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.employee.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.rolePermission.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.role.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.workingHours.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.branchSettings.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.branch.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.auditLog.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.restaurant.deleteMany({ where: { id: { in: ids } } });
    }

    await new Promise((resolve) => {
      server.closeAllConnections?.();
      server.close(resolve);
    });

    await disconnectRedis();
  });

  test("1. POST /api/v1/branches/:branchId/tables creates a table (201 Created)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${mainBranchA.id}/tables`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        label: "T-01",
        capacity: 4,
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.equal(body.data.label, "T-01");
    assert.equal(body.data.capacity, 4);
    assert.ok(body.data.qrToken);
    assert.ok(body.data.qrUrl);
    tableA1 = body.data;
    initialQrToken = body.data.qrToken;
  });

  test("2. Duplicate table label in same branch returns 409 ConflictError", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${mainBranchA.id}/tables`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        label: "T-01",
      }),
    });

    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error.code, "CONFLICT_ERROR");
  });

  test("3. Same table label in a different branch of the same tenant is allowed (201 Created)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${secondaryBranchA.id}/tables`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        label: "T-01",
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.equal(body.data.label, "T-01");
    assert.equal(body.data.branchId, secondaryBranchA.id);
    tableA2 = body.data;
  });

  test("4. GET /api/v1/branches/:branchId/tables lists branch tables with pagination", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${mainBranchA.id}/tables`, {
      headers: {
        Authorization: `Bearer ${ownerAToken}`,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.equal(body.pagination.total, 1);
  });

  test("5. Cross-Tenant Branch: Creating table on Tenant B branch returns 404 Not Found", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${mainBranchB.id}/tables`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        label: "T-99",
      }),
    });

    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  test("6. GET /api/v1/menu/table/:qrToken resolves public table menu", async () => {
    const res = await fetch(`${baseUrl}/api/v1/menu/table/${initialQrToken}`);

    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.equal(body.data.table.id, tableA1.id);
    assert.equal(body.data.branch.id, mainBranchA.id);
    assert.equal(body.data.restaurant.id, tenantA.id);
    assert.ok(Array.isArray(body.data.categories));
  });

  test("7. POST /api/v1/branches/:branchId/tables/:id/regenerate-qr rotates QR token", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${mainBranchA.id}/tables/${tableA1.id}/regenerate-qr`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ownerAToken}`,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.notEqual(body.data.qrToken, initialQrToken);
    assert.ok(body.data.qrUrl);
  });

  test("8. Scanning old invalidated QR token returns 404 Not Found", async () => {
    const res = await fetch(`${baseUrl}/api/v1/menu/table/${initialQrToken}`);

    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  test("9. Cross-Tenant Protection: Tenant B cannot access Tenant A's table (404 Not Found)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${mainBranchA.id}/tables/${tableA1.id}`, {
      headers: {
        Authorization: `Bearer ${ownerBToken}`,
      },
    });

    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  test("10. DELETE /api/v1/branches/:branchId/tables/:id soft deletes table", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${mainBranchA.id}/tables/${tableA1.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${ownerAToken}`,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
  });

  test("11. RBAC: Employee without tables.manage permission gets 403 AuthorizationError", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${mainBranchA.id}/tables`, {
      headers: {
        Authorization: `Bearer ${staffAToken}`,
      },
    });

    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error.code, "AUTHORIZATION_ERROR");
  });
});
