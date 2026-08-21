import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import app from "../src/app/app.js";
import prisma from "../src/lib/prisma.js";
import { authService } from "../src/modules/auth/auth.service.js";
import { disconnectRedis } from "../src/config/redis.js";

describe("Employees Module Integration & Security Tests", () => {
  let server;
  let baseUrl;

  let restaurantA;
  let ownerA;
  let ownerAToken;

  let restaurantB;
  let ownerB;
  let ownerBToken;

  let createdEmployeeA;

  before(async () => {
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, () => {
        const address = server.address();
        baseUrl = `http://localhost:${address.port}`;
        resolve();
      });
    });

    // 1. Setup Tenant A
    const regA = await authService.register({
      name: "Owner A",
      email: `ownera-${Date.now()}@test.com`,
      password: "Password123!",
      restaurantName: "Emp Test Rest A",
      restaurantSlug: `emp-rest-a-${Date.now()}`,
    });
    restaurantA = regA.restaurant;
    ownerA = regA.employee;

    const loginA = await authService.login({
      email: regA.employee.email,
      password: "Password123!",
      device: "Test-Runner-A",
      ipAddress: "127.0.0.1",
    });
    ownerAToken = loginA.accessToken;

    // 2. Setup Tenant B
    const regB = await authService.register({
      name: "Owner B",
      email: `ownerb-${Date.now()}@test.com`,
      password: "Password123!",
      restaurantName: "Emp Test Rest B",
      restaurantSlug: `emp-rest-b-${Date.now()}`,
    });
    restaurantB = regB.restaurant;
    ownerB = regB.employee;

    const loginB = await authService.login({
      email: regB.employee.email,
      password: "Password123!",
      device: "Test-Runner-B",
      ipAddress: "127.0.0.1",
    });
    ownerBToken = loginB.accessToken;
  });

  after(async () => {
    const ids = [restaurantA?.id, restaurantB?.id].filter(Boolean);
    if (ids.length > 0) {
      await prisma.session.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.employeeBranchAccess.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.employee.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.rolePermission.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.role.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.branch.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.restaurant.deleteMany({ where: { id: { in: ids } } });
    }

    await new Promise((resolve) => {
      server.closeAllConnections?.();
      server.close(resolve);
    });

    await disconnectRedis();
  });

  test("1. POST /api/v1/employees creates a new staff employee for Tenant A (201 Created)", async () => {
    const managerRole = await prisma.role.findFirst({
      where: { restaurantId: restaurantA.id, name: "manager" },
    });
    const mainBranch = await prisma.branch.findFirst({
      where: { restaurantId: restaurantA.id, isMain: true },
    });

    const res = await fetch(`${baseUrl}/api/v1/employees`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        name: "Staff Employee 1",
        email: `staff1-${Date.now()}@testa.com`,
        password: "Password123!",
        branchId: mainBranch.id,
        roleId: managerRole.id,
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.equal(body.data.passwordHash, undefined); // Password hash omitted
    createdEmployeeA = body.data;
  });

  test("2. GET /api/v1/employees lists employees with pagination structure", async () => {
    const res = await fetch(`${baseUrl}/api/v1/employees?page=1&limit=10`, {
      headers: {
        Authorization: `Bearer ${ownerAToken}`,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.equal(body.pagination.page, 1);
    assert.equal(body.pagination.limit, 10);
  });

  test("2a. GET /api/v1/employees without any query params returns 200 (not validation error)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/employees`, {
      headers: {
        Authorization: `Bearer ${ownerAToken}`,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.equal(body.pagination.page, 1);
    assert.equal(body.pagination.limit, 20);
  });

  test("3. Cross-Tenant branchId: Tenant A cannot create employee bound to Tenant B's branch (404 Not Found)", async () => {
    const branchB = await prisma.branch.findFirst({
      where: { restaurantId: restaurantB.id, isMain: true },
    });

    const res = await fetch(`${baseUrl}/api/v1/employees`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        name: "Bad Branch Staff",
        email: `badbranch-${Date.now()}@testa.com`,
        password: "Password123!",
        branchId: branchB.id, // Tenant B's branch!
        roleId: (
          await prisma.role.findFirst({
            where: { restaurantId: restaurantA.id, name: "manager" },
          })
        ).id,
      }),
    });

    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  test("4. Cross-Tenant Protection: Tenant B cannot access Tenant A's employee (404 Not Found)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/employees/${createdEmployeeA.id}`, {
      headers: {
        Authorization: `Bearer ${ownerBToken}`, // Token from Tenant B
      },
    });

    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  test("4. Self Role Escalation Check: Owner A attempting to alter their own role is rejected (422 BusinessRuleError)", async () => {
    const managerRole = await prisma.role.findFirst({
      where: { restaurantId: restaurantA.id, name: "manager" },
    });

    const res = await fetch(`${baseUrl}/api/v1/employees/${ownerA.id}/role`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        roleId: managerRole.id,
      }),
    });

    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.error.code, "BUSINESS_RULE_ERROR");
  });

  test("5. Self Password Change requires currentPassword (401 AuthenticationError if omitted)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/employees/${ownerA.id}/password`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        newPassword: "NewPassword123!", // Missing currentPassword
      }),
    });

    assert.equal(res.status, 401);
  });

  test("6. DELETE /api/v1/employees/:id performs Soft Delete (deletedAt set & status INACTIVE)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/employees/${createdEmployeeA.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${ownerAToken}`,
      },
    });

    assert.equal(res.status, 200);

    const deletedInDb = await prisma.employee.findFirst({
      where: { id: createdEmployeeA.id, restaurantId: restaurantA.id },
    });

    assert.notEqual(deletedInDb.deletedAt, null);
    assert.equal(deletedInDb.status, "INACTIVE");
  });

  test("7. GET /api/v1/employees supports search, status, roleId and sort filters", async () => {
    const managerRole = await prisma.role.findFirst({
      where: { restaurantId: restaurantA.id, name: "manager" },
    });
    const mainBranch = await prisma.branch.findFirst({
      where: { restaurantId: restaurantA.id, isMain: true },
    });

    const unique = Date.now();
    const zetaEmail = `zetaflt-${unique}@testa.com`;
    const alphaEmail = `alphaflt-${unique}@testa.com`;

    const createZeta = await fetch(`${baseUrl}/api/v1/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerAToken}` },
      body: JSON.stringify({
        name: "Zeta Filter Target",
        email: zetaEmail,
        password: "Password123!",
        branchId: mainBranch.id,
        roleId: managerRole.id,
      }),
    });
    assert.equal(createZeta.status, 201);

    const createAlpha = await fetch(`${baseUrl}/api/v1/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerAToken}` },
      body: JSON.stringify({
        name: "Alpha Filter Target",
        email: alphaEmail,
        password: "Password123!",
        branchId: mainBranch.id,
        roleId: managerRole.id,
      }),
    });
    assert.equal(createAlpha.status, 201);

    // search by name
    const searchRes = await fetch(`${baseUrl}/api/v1/employees?search=Zeta`, {
      headers: { Authorization: `Bearer ${ownerAToken}` },
    });
    const searchBody = await searchRes.json();
    assert.equal(searchRes.status, 200);
    assert.ok(searchBody.data.some((e) => e.name === "Zeta Filter Target"));

    // status filter
    const statusRes = await fetch(`${baseUrl}/api/v1/employees?status=ACTIVE`, {
      headers: { Authorization: `Bearer ${ownerAToken}` },
    });
    const statusBody = await statusRes.json();
    assert.equal(statusRes.status, 200);
    assert.ok(statusBody.data.every((e) => e.status === "ACTIVE"));

    // roleId filter
    const roleRes = await fetch(`${baseUrl}/api/v1/employees?roleId=${managerRole.id}`, {
      headers: { Authorization: `Bearer ${ownerAToken}` },
    });
    const roleBody = await roleRes.json();
    assert.equal(roleRes.status, 200);
    assert.ok(roleBody.data.every((e) => e.roleId === managerRole.id));

    // sort by name asc
    const sortRes = await fetch(`${baseUrl}/api/v1/employees?sort=name:asc`, {
      headers: { Authorization: `Bearer ${ownerAToken}` },
    });
    const sortBody = await sortRes.json();
    assert.equal(sortRes.status, 200);
    assert.ok(sortBody.data.length >= 2);
    const names = sortBody.data.map((e) => e.name);
    assert.equal(names[0] < names[1], true);

    // row shape: branch + role included
    const target = sortBody.data.find((e) => e.email === zetaEmail);
    assert.ok(target);
    assert.ok(target.branch && target.branch.id);
    assert.ok(target.role && target.role.id && target.role.name);
  });
});
