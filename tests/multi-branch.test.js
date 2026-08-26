import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import bcrypt from "bcrypt";
import app from "../src/app/app.js";
import prisma from "../src/lib/prisma.js";
import { authService } from "../src/modules/auth/auth.service.js";
import { seedPermissions } from "../prisma/seed.js";
import { disconnectRedis } from "../src/config/redis.js";

describe("Module 19 — Multi-Branch Management Integration Tests", () => {
  let server;
  let baseUrl;
  let tenantA;
  let branchA;
  let branchB;
  let ownerToken;
  let empX;
  let empXToken;
  let empY;
  let noPermToken;
  let tenantB;
  let branchBA;
  let ownerBToken;

  const auth = (token) => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });

  before(async () => {
    await seedPermissions();

    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, () => {
        const address = server.address();
        baseUrl = `http://localhost:${address.port}`;
        resolve();
      });
    });

    const uniq = Date.now();

    const regA = await authService.register({
      name: "Owner MB A",
      email: `mba-${uniq}@test.com`,
      password: "Password123!",
      restaurantName: "MB Rest A",
      restaurantSlug: `mb-a-${uniq}`,
    });
    tenantA = regA.restaurant;
    branchA = await prisma.branch.findFirst({ where: { restaurantId: tenantA.id, isMain: true } });
    const loginA = await authService.login({ email: regA.employee.email, password: "Password123!", device: "A", ipAddress: "127.0.0.1" });
    ownerToken = loginA.accessToken;

    branchB = await prisma.branch.create({
      data: { restaurantId: tenantA.id, name: "Branch B", code: "B2", isMain: false },
    });

    const passwordHash = await bcrypt.hash("Password123!", 10);
    const basicRole = await prisma.role.create({ data: { restaurantId: tenantA.id, name: "MB Basic Role", description: "basic" } });
    const noPermRole = await prisma.role.create({ data: { restaurantId: tenantA.id, name: "MB No Perm Role", description: "no perm" } });

    const mkEmp = async (name, email, branchId, roleId) =>
      prisma.employee.create({
        data: { restaurantId: tenantA.id, branchId, roleId, name, email, passwordHash },
      });

    empX = await mkEmp("Emp X", `mbx-${uniq}@test.com`, branchA.id, basicRole.id);
    empY = await mkEmp("Emp Y", `mby-${uniq}@test.com`, branchB.id, basicRole.id);
    const loginX = await authService.login({ email: empX.email, password: "Password123!", device: "X", ipAddress: "127.0.0.1" });
    empXToken = loginX.accessToken;

    const noPermEmp = await mkEmp("No Perm", `mbnoperm-${uniq}@test.com`, branchA.id, noPermRole.id);
    const noPermLogin = await authService.login({ email: noPermEmp.email, password: "Password123!", device: "NoPerm", ipAddress: "127.0.0.1" });
    noPermToken = noPermLogin.accessToken;

    const regB = await authService.register({
      name: "Owner MB B",
      email: `mbb-${uniq}@test.com`,
      password: "Password123!",
      restaurantName: "MB Rest B",
      restaurantSlug: `mb-b-${uniq}`,
    });
    tenantB = regB.restaurant;
    branchBA = await prisma.branch.findFirst({ where: { restaurantId: tenantB.id, isMain: true } });
    const loginB = await authService.login({ email: regB.employee.email, password: "Password123!", device: "B", ipAddress: "127.0.0.1" });
    ownerBToken = loginB.accessToken;
  });

  after(async () => {
    for (const tenant of [tenantA, tenantB]) {
      if (!tenant) continue;
      const id = tenant.id;
      await prisma.auditLog.deleteMany({ where: { restaurantId: id } });
      await prisma.orderStatusHistory.deleteMany({ where: { restaurantId: id } });
      await prisma.orderItem.deleteMany({ where: { restaurantId: id } });
      await prisma.order.deleteMany({ where: { restaurantId: id } });
      await prisma.employeeBranchAccess.deleteMany({ where: { restaurantId: id } });
      await prisma.session.deleteMany({ where: { restaurantId: id } });
      await prisma.employee.deleteMany({ where: { restaurantId: id } });
      await prisma.rolePermission.deleteMany({ where: { restaurantId: id } });
      await prisma.role.deleteMany({ where: { restaurantId: id } });
      await prisma.workingHours.deleteMany({ where: { restaurantId: id } });
      await prisma.branchSettings.deleteMany({ where: { restaurantId: id } });
      await prisma.branch.deleteMany({ where: { restaurantId: id } });
      await prisma.restaurant.deleteMany({ where: { id } });
    }
    await new Promise((resolve) => {
      server.closeAllConnections?.();
      server.close(resolve);
    });
    await disconnectRedis();
  });

  const listUsers = (branchId, token = ownerToken) =>
    fetch(`${baseUrl}/api/v1/branches/${branchId}/users`, { headers: auth(token) });
  const grant = (branchId, employeeId) =>
    fetch(`${baseUrl}/api/v1/branches/${branchId}/users`, {
      method: "POST",
      headers: auth(ownerToken),
      body: JSON.stringify({ employeeId }),
    });
  const revoke = (branchId, employeeId) =>
    fetch(`${baseUrl}/api/v1/branches/${branchId}/users/${employeeId}`, { method: "DELETE", headers: auth(ownerToken) });

  test("1. list branch users returns home-branch employees", async () => {
    const res = await listUsers(branchA.id);
    assert.equal(res.status, 200);
    const body = await res.json();
    const ids = body.data.map((u) => u.id);
    assert.ok(ids.includes(empX.id));
    assert.ok(body.data.find((u) => u.id === empX.id).isHomeBranch === true);
    assert.ok(!ids.includes(empY.id));
  });

  test("2. grant access to an additional branch -> 201", async () => {
    const res = await grant(branchB.id, empX.id);
    assert.equal(res.status, 201);
  });

  test("3. duplicate grant -> 409", async () => {
    const res = await grant(branchB.id, empX.id);
    assert.equal(res.status, 409);
  });

  test("4. grant access to the employee's HOME branch -> 422", async () => {
    const res = await grant(branchA.id, empX.id);
    assert.equal(res.status, 422);
  });

  test("5. cross-tenant: grant tenant B employee to tenant A branch -> 404", async () => {
    const foreignEmpId = (await prisma.employee.findFirst({ where: { restaurantId: tenantB.id } })).id;
    const res = await grant(branchB.id, foreignEmpId);
    assert.equal(res.status, 404);
  });

  test("6. granted employee now appears in the target branch users list", async () => {
    const res = await listUsers(branchB.id);
    const body = await res.json();
    const emp = body.data.find((u) => u.id === empX.id);
    assert.ok(emp);
    assert.equal(emp.isHomeBranch, false);
  });

  test("7. revoke access -> 200, then revoke again -> 404", async () => {
    const first = await revoke(branchB.id, empX.id);
    assert.equal(first.status, 200);

    const second = await revoke(branchB.id, empX.id);
    assert.equal(second.status, 404);
  });

  test("8. revoke the employee's HOME branch -> 422", async () => {
    const res = await revoke(branchA.id, empX.id);
    assert.equal(res.status, 422);
  });

  test("9. GET /v1/employees/me/branches returns home + granted branches (branch switcher)", async () => {

    await grant(branchB.id, empX.id);

    const res = await fetch(`${baseUrl}/api/v1/employees/me/branches`, {
      headers: auth(empXToken),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    const ids = body.data.map((b) => b.id);
    assert.ok(ids.includes(branchA.id));
    assert.ok(ids.includes(branchB.id));
  });

  test("10. RBAC: employee without branches.manage -> 403 on list/grant", async () => {
    const list = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/users`, { headers: auth(noPermToken) });
    assert.equal(list.status, 403);
    const grantRes = await fetch(`${baseUrl}/api/v1/branches/${branchB.id}/users`, {
      method: "POST",
      headers: auth(noPermToken),
      body: JSON.stringify({ employeeId: empY.id }),
    });
    assert.equal(grantRes.status, 403);
  });

  test("11. unauthenticated -> 401", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/users`);
    assert.equal(res.status, 401);
  });

  test("12. mass assignment: grant ignores extra fields (restaurantId/branchId in body)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchB.id}/users`, {
      method: "POST",
      headers: auth(ownerToken),
      body: JSON.stringify({ employeeId: empY.id, restaurantId: tenantB.id, branchId: branchBA.id }),
    });

    assert.equal(res.status, 422);
  });

  test("13. dashboard branch comparison reports per-branch orders/revenue", async () => {
    const mkOrder = (branchId, orderNumber, total, status = "DELIVERED") =>
      prisma.order.create({
        data: {
        orderDate: "2026-08-25",
          orderNumber,
          restaurantId: tenantA.id,
          branchId,
          source: "CASHIER",
          type: "DINE_IN",
          status,
          paymentStatus: status === "CANCELLED" ? "PENDING" : "PAID",
          subtotal: total,
          total,
        },
      });
    await mkOrder(branchA.id, 2001, 100);
    await mkOrder(branchA.id, 2002, 50);
    await mkOrder(branchB.id, 3001, 250);
    await mkOrder(branchB.id, 3002, 150, "CANCELLED");

    const res = await fetch(`${baseUrl}/api/v1/dashboard/branches-comparison`, {
      headers: auth(ownerToken),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    const branchAStats = body.data.find((b) => b.branchId === branchA.id);
    const branchBStats = body.data.find((b) => b.branchId === branchB.id);

    assert.equal(branchAStats.orders, 2);
    assert.equal(branchAStats.revenue, 150);
    assert.equal(branchBStats.orders, 1);
    assert.equal(branchBStats.revenue, 250);
    assert.equal(branchBStats.paidRevenue, 250);
    assert.equal(branchAStats.averageOrderValue, 75);

    assert.ok(body.data[0].revenue >= body.data[1].revenue);
  });

  test("14. cross-tenant: tenant B cannot see tenant A branch comparison data", async () => {
    const res = await fetch(`${baseUrl}/api/v1/dashboard/branches-comparison`, {
      headers: auth(ownerBToken),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.length, 1);
    assert.ok(!body.data.some((b) => b.branchId === branchA.id));
  });

  test("15. branch comparison -> 401 unauthenticated", async () => {
    const res = await fetch(`${baseUrl}/api/v1/dashboard/branches-comparison`);
    assert.equal(res.status, 401);
  });
});
