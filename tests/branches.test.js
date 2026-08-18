import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import app from "../src/app/app.js";
import prisma from "../src/lib/prisma.js";
import { authService } from "../src/modules/auth/auth.service.js";
import { disconnectRedis } from "../src/config/redis.js";

describe("Branches Module Integration Tests", () => {
  let server;
  let baseUrl;

  let tenantA;
  let ownerAToken;
  let mainBranchA;

  let tenantB;
  let ownerBToken;

  let createdBranchA;

  before(async () => {
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, () => {
        const address = server.address();
        baseUrl = `http://localhost:${address.port}`;
        resolve();
      });
    });

    // Setup Tenant A
    const regA = await authService.register({
      name: "Owner Branch A",
      email: `ownerbrancha-${Date.now()}@test.com`,
      password: "Password123!",
      restaurantName: "Branch Rest A",
      restaurantSlug: `branch-rest-a-${Date.now()}`,
    });
    tenantA = regA.restaurant;
    mainBranchA = await prisma.branch.findFirst({
      where: { restaurantId: tenantA.id, isMain: true },
    });

    const loginA = await authService.login({
      email: regA.employee.email,
      password: "Password123!",
      device: "Test-Runner-BranchA",
      ipAddress: "127.0.0.1",
    });
    ownerAToken = loginA.accessToken;

    // Setup Tenant B
    const regB = await authService.register({
      name: "Owner Branch B",
      email: `ownerbranchb-${Date.now()}@test.com`,
      password: "Password123!",
      restaurantName: "Branch Rest B",
      restaurantSlug: `branch-rest-b-${Date.now()}`,
    });
    tenantB = regB.restaurant;

    const loginB = await authService.login({
      email: regB.employee.email,
      password: "Password123!",
      device: "Test-Runner-BranchB",
      ipAddress: "127.0.0.1",
    });
    ownerBToken = loginB.accessToken;
  });

  after(async () => {
    const ids = [tenantA?.id, tenantB?.id].filter(Boolean);
    if (ids.length > 0) {
      await prisma.session.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.employeeBranchAccess.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.employee.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.rolePermission.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.role.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.workingHours.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.branchSettings.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.branch.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.restaurant.deleteMany({ where: { id: { in: ids } } });
    }

    await new Promise((resolve) => {
      server.closeAllConnections?.();
      server.close(resolve);
    });

    await disconnectRedis();
  });

  test("1. POST /api/v1/branches creates a secondary branch for Tenant A (201 Created)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        name: "Downtown Branch",
        code: "DT01",
        city: "Cairo",
        street: "Tahrir Square",
        phone: "+201000000001",
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.equal(body.data.name, "Downtown Branch");
    assert.equal(body.data.code, "DT01");
    assert.equal(body.data.isMain, false);
    createdBranchA = body.data;
  });

  test("2. Duplicate branch code within tenant returns 409 ConflictError", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        name: "Duplicate Code Branch",
        code: "DT01", // Duplicate code!
      }),
    });

    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error.code, "CONFLICT_ERROR");
  });

  test("3. Attempting to create a second main branch returns 422 BusinessRuleError", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        name: "Second Main Branch",
        code: "MAIN2",
        isMain: true, // Second main branch!
      }),
    });

    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.error.code, "BUSINESS_RULE_ERROR");
  });

  test("4. GET /api/v1/branches lists tenant branches with pagination", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches?page=1&limit=10`, {
      headers: {
        Authorization: `Bearer ${ownerAToken}`,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.equal(body.pagination.total, 2); // MAIN + DT01
  });

  test("4b. Mass Assignment: sending restaurantId/id in body is ignored (branch stays in own tenant)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        name: "Mass Assignment Branch",
        code: "MA01",
        restaurantId: tenantB.id, // Must be ignored
        id: "forged-id-12345", // Must be ignored
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.data.restaurantId, tenantA.id);
    assert.notEqual(body.data.id, "forged-id-12345");
  });

  test("5. Cross-Tenant Protection: Tenant B cannot access Tenant A's branch (404 Not Found)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${createdBranchA.id}`, {
      headers: {
        Authorization: `Bearer ${ownerBToken}`, // Token from Tenant B
      },
    });

    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  test("5b. Cross-Tenant Protection: Tenant B cannot PATCH Tenant A's branch (404 Not Found)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${createdBranchA.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerBToken}`, // Token from Tenant B
      },
      body: JSON.stringify({
        name: "Hijacked Branch Name",
      }),
    });

    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  test("6. Attempting to deactivate or delete Main Branch returns 422 BusinessRuleError", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${mainBranchA.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${ownerAToken}`,
      },
    });

    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.error.code, "BUSINESS_RULE_ERROR");
  });

  test("7. DELETE /api/v1/branches/:id deactivates a secondary branch", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${createdBranchA.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${ownerAToken}`,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
  });

  test("7b. PATCH /api/v1/branches/:id updates branch fields", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${createdBranchA.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        name: "Downtown Branch (Renovated)",
        city: "Giza",
        contactPhone: "+201100000002",
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.name, "Downtown Branch (Renovated)");
    assert.equal(body.data.city, "Giza");
    assert.equal(body.data.contactPhone, "+201100000002");
  });

  test("8. PUT /api/v1/branches/:id/working-hours batch upserts 7-day working hours", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${createdBranchA.id}/working-hours`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        workingHours: [
          { day: "MON", openTime: "08:00", closeTime: "22:00", isOpen: true },
          { day: "TUE", openTime: "08:00", closeTime: "22:00", isOpen: true },
          { day: "WED", openTime: "08:00", closeTime: "22:00", isOpen: true },
        ],
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.equal(body.data.length, 3);
  });

  test("9. PUT /api/v1/branches/:id/working-hours with invalid time format returns 400 VALIDATION_ERROR", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${createdBranchA.id}/working-hours`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        workingHours: [
          { day: "MON", openTime: "8am", closeTime: "10pm", isOpen: true }, // Invalid time format
        ],
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, "VALIDATION_ERROR");
  });

  test("10. PUT /api/v1/branches/:id/settings upserts branch settings", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${createdBranchA.id}/settings`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        currency: "USD",
        timezone: "America/New_York",
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.equal(body.data.currency, "USD");
    assert.equal(body.data.timezone, "America/New_York");
  });

  test("10b. GET /api/v1/branches/:id returns branch details with workingHours and settings", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${createdBranchA.id}`, {
      headers: {
        Authorization: `Bearer ${ownerAToken}`,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.equal(body.data.id, createdBranchA.id);
    assert.ok(Array.isArray(body.data.workingHours));
    assert.equal(body.data.workingHours.length, 3);
    assert.equal(body.data.settings.currency, "USD");
    assert.equal(body.data.settings.timezone, "America/New_York");
  });

  test("11. RBAC: Employee without branches.manage permission gets 403 on branch endpoints", async () => {
    const limitedEmail = `limited-${Date.now()}@test.com`;

    // Create a custom role WITHOUT branches.manage
    const roleRes = await fetch(`${baseUrl}/api/v1/roles`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        name: "Branchless Staff",
        description: "Role without branch management permissions",
        permissions: ["employees.view"],
      }),
    });

    assert.equal(roleRes.status, 201);
    const roleBody = await roleRes.json();

    // Create an employee holding that limited role
    const empRes = await fetch(`${baseUrl}/api/v1/employees`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        name: "Limited Staff",
        email: limitedEmail,
        password: "Password123!",
        branchId: mainBranchA.id,
        roleId: roleBody.data.id,
      }),
    });

    assert.equal(empRes.status, 201);
    const empBody = await empRes.json();
    assert.equal(empBody.success, true);

    const login = await authService.login({
      email: limitedEmail,
      password: "Password123!",
      device: "Test-Runner-Limited",
      ipAddress: "127.0.0.1",
    });

    const res = await fetch(`${baseUrl}/api/v1/branches`, {
      headers: {
        Authorization: `Bearer ${login.accessToken}`,
      },
    });

    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error.code, "AUTHORIZATION_ERROR");
  });
});
