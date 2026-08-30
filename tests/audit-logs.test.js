import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import bcrypt from "bcrypt";
import app from "../src/app/app.js";
import prisma from "../src/lib/prisma.js";
import { authService } from "../src/modules/auth/auth.service.js";
import { seedPermissions } from "../prisma/seed.js";
import { disconnectRedis } from "../src/config/redis.js";

async function waitFor(probe, { timeout = 4000, interval = 50 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const result = await probe();
    if (result) return result;
    if (Date.now() > deadline) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, interval));
  }
}

describe("Module 18 — Audit Logs Integration Tests", () => {
  let server;
  let baseUrl;
  let tenantA;
  let branchA;
  let ownerToken;
  let noAuditToken;
  let tenantB;
  let ownerBToken;
  let productA;
  let targetEmpId;

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
      name: "Owner Audit A",
      email: `audita-${uniq}@test.com`,
      password: "Password123!",
      restaurantName: "Audit Rest A",
      restaurantSlug: `audit-a-${uniq}`,
    });
    tenantA = regA.restaurant;
    branchA = await prisma.branch.findFirst({ where: { restaurantId: tenantA.id, isMain: true } });
    const loginA = await authService.login({ email: regA.employee.email, password: "Password123!", device: "A", ipAddress: "127.0.0.1" });
    ownerToken = loginA.accessToken;

    const cat = await prisma.category.create({ data: { restaurantId: tenantA.id, name: "Cat" } });
    productA = await prisma.product.create({ data: { restaurantId: tenantA.id, categoryId: cat.id, name: "Burger", price: 100 } });

    const passwordHash = await bcrypt.hash("Password123!", 10);

    const basicRole = await prisma.role.create({ data: { restaurantId: tenantA.id, name: "Basic Role", description: "basic" } });
    const targetEmp = await prisma.employee.create({
      data: { restaurantId: tenantA.id, branchId: branchA.id, roleId: basicRole.id, name: "Target Emp", email: `target-${uniq}@test.com`, passwordHash },
    });
    targetEmpId = targetEmp.id;
    await authService.login({ email: targetEmp.email, password: "Password123!", device: "Target", ipAddress: "127.0.0.1" });

    const noAuditRole = await prisma.role.create({ data: { restaurantId: tenantA.id, name: "No Audit Role", description: "no audit" } });
    const noAuditEmp = await prisma.employee.create({
      data: { restaurantId: tenantA.id, branchId: branchA.id, roleId: noAuditRole.id, name: "No Audit", email: `noaudit-${uniq}@test.com`, passwordHash },
    });
    const noAuditLogin = await authService.login({ email: noAuditEmp.email, password: "Password123!", device: "NoAudit", ipAddress: "127.0.0.1" });
    noAuditToken = noAuditLogin.accessToken;

    const regB = await authService.register({
      name: "Owner Audit B",
      email: `auditb-${uniq}@test.com`,
      password: "Password123!",
      restaurantName: "Audit Rest B",
      restaurantSlug: `audit-b-${uniq}`,
    });
    tenantB = regB.restaurant;
    const loginB = await authService.login({ email: regB.employee.email, password: "Password123!", device: "B", ipAddress: "127.0.0.1" });
    ownerBToken = loginB.accessToken;
  });

  after(async () => {
    for (const tenant of [tenantA, tenantB]) {
      if (!tenant) continue;
      const id = tenant.id;
      await prisma.auditLog.deleteMany({ where: { restaurantId: id } });
      await prisma.notification.deleteMany({ where: { restaurantId: id } });
      await prisma.notificationPreference.deleteMany({ where: { restaurantId: id } });
      await prisma.orderStatusHistory.deleteMany({ where: { restaurantId: id } });
      await prisma.orderItem.deleteMany({ where: { restaurantId: id } });
      await prisma.order.deleteMany({ where: { restaurantId: id } });
      await prisma.coupon.deleteMany({ where: { restaurantId: id } });
      await prisma.product.deleteMany({ where: { restaurantId: id } });
      await prisma.category.deleteMany({ where: { restaurantId: id } });
      await prisma.session.deleteMany({ where: { restaurantId: id } });
      await prisma.employeeBranchAccess.deleteMany({ where: { restaurantId: id } });
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

  const placeOrder = (body = {}) =>
    fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders`, { method: "POST", headers: auth(ownerToken), body: JSON.stringify(body) });

  const auditLogs = (query = "") =>
    fetch(`${baseUrl}/api/v1/audit-logs${query}`, { headers: auth(ownerToken) }).then((r) => r.json());

  const waitForAction = (action, predicate) =>
    waitFor(async () => {
      const body = await auditLogs(`?action=${action}`);
      return body.data.find(predicate);
    });

  test("1. placing an order creates an ORDER_CREATED audit entry", async () => {
    const res = await placeOrder({ type: "PICKUP", items: [{ productId: productA.id, quantity: 1 }] });
    assert.equal(res.status, 201);
    const order = (await res.json()).data;

    const entry = await waitForAction("ORDER_CREATED", (e) => e.entityId === order.id);
    assert.ok(entry);
    assert.equal(entry.entityType, "order");
    assert.ok(entry.metadata.orderNumber === order.orderNumber);
  });

  test("2. cancelling an order creates an ORDER_CANCELLED audit entry", async () => {
    const res = await placeOrder({ type: "PICKUP", items: [{ productId: productA.id, quantity: 1 }] });
    const order = (await res.json()).data;

    const cancel = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${order.id}/cancel`, {
      method: "POST",
      headers: auth(ownerToken),
      body: JSON.stringify({ expectedVersion: order.version, reason: "test cancel" }),
    });
    assert.equal(cancel.status, 200);

    const entry = await waitForAction("ORDER_CANCELLED", (e) => e.entityId === order.id);
    assert.ok(entry);
    assert.equal(entry.metadata.status, "CANCELLED");
  });

  test("3. order payment creates an ORDER_PAID audit entry", async () => {
    const res = await placeOrder({ type: "PICKUP", items: [{ productId: productA.id, quantity: 1 }] });
    const order = (await res.json()).data;

    const pay = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${order.id}/payment`, {
      method: "POST",
      headers: auth(ownerToken),
      body: JSON.stringify({ paymentMethod: "CASH", amount: Number(order.total), expectedVersion: order.version }),
    });
    assert.equal(pay.status, 200);

    const entry = await waitForAction("ORDER_PAID", (e) => e.entityId === order.id);
    assert.ok(entry);
  });

  test("4. force logout creates an EMPLOYEE_FORCE_LOGGED_OUT audit entry", async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/force-logout`, {
      method: "POST",
      headers: auth(ownerToken),
      body: JSON.stringify({ employeeId: targetEmpId }),
    });
    assert.equal(res.status, 200);

    const entry = await waitForAction("EMPLOYEE_FORCE_LOGGED_OUT", (e) => e.entityId === targetEmpId);
    assert.ok(entry);
    assert.equal(entry.entityType, "employee");
  });

  test("5. creating a role creates a ROLE_CREATED audit entry", async () => {
    const res = await fetch(`${baseUrl}/api/v1/roles`, {
      method: "POST",
      headers: auth(ownerToken),
      body: JSON.stringify({ name: "audit-role-test", description: "test", permissions: ["employees.view"] }),
    });
    assert.equal(res.status, 201);
    const role = (await res.json()).data;

    const entry = await waitForAction("ROLE_CREATED", (e) => e.entityId === role.id);
    assert.ok(entry);
    assert.equal(entry.metadata.name, "audit-role-test");
  });

  test("6. updating a role (permission change) creates a ROLE_UPDATED audit entry", async () => {
    const created = await fetch(`${baseUrl}/api/v1/roles`, {
      method: "POST",
      headers: auth(ownerToken),
      body: JSON.stringify({ name: "audit-role-update", description: "test", permissions: ["employees.view"] }),
    });
    const role = (await created.json()).data;

    const update = await fetch(`${baseUrl}/api/v1/roles/${role.id}`, {
      method: "PATCH",
      headers: auth(ownerToken),
      body: JSON.stringify({ description: "updated description" }),
    });
    assert.equal(update.status, 200);

    const entry = await waitForAction("ROLE_UPDATED", (e) => e.entityId === role.id);
    assert.ok(entry);
  });

  test("7. creating a coupon creates a COUPON_CREATED audit entry", async () => {
    const res = await fetch(`${baseUrl}/api/v1/coupons`, {
      method: "POST",
      headers: auth(ownerToken),
      body: JSON.stringify({ code: "AUDIT10", type: "PERCENTAGE", value: 10 }),
    });
    assert.equal(res.status, 201);
    const coupon = (await res.json()).data;

    const entry = await waitForAction("COUPON_CREATED", (e) => e.entityId === coupon.id);
    assert.ok(entry);
    assert.equal(entry.metadata.code, "AUDIT10");
  });

  test("8. list with filters (action, entityType+entityId, date range) + pagination", async () => {
    const byAction = await auditLogs(`?action=ORDER_PAID`);
    assert.ok(byAction.data.length >= 1);
    assert.ok(byAction.data.every((e) => e.action === "ORDER_PAID"));

    const order = (await placeOrder({ type: "PICKUP", items: [{ productId: productA.id, quantity: 1 }] }).then((r) => r.json())).data;
    const byEntity = await auditLogs(`?entityType=order&entityId=${order.id}`);
    assert.ok(byEntity.data.some((e) => e.entityId === order.id));

    const from = new Date(Date.now() - 3600_000).toISOString();
    const to = new Date(Date.now() + 3600_000).toISOString();
    const byRange = await auditLogs(`?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    assert.ok(byRange.data.length >= 1);
    assert.ok(byRange.pagination.page === 1);
    assert.ok(byRange.pagination.total >= 1);
  });

  test("9. GET /v1/audit-logs/:id returns a single entry", async () => {
    const list = (await auditLogs(`?action=ROLE_CREATED`)).data;
    assert.ok(list.length > 0);
    const entry = list[0];
    const get = await fetch(`${baseUrl}/api/v1/audit-logs/${entry.id}`, { headers: auth(ownerToken) });
    assert.equal(get.status, 200);
    const body = await get.json();
    assert.equal(body.data.id, entry.id);
  });

  test("10. cross-tenant: tenant B cannot read tenant A audit logs (list empty + 404 on id)", async () => {
    const bList = await fetch(`${baseUrl}/api/v1/audit-logs`, { headers: auth(ownerBToken) });
    assert.equal(bList.status, 200);
    const bBody = await bList.json();
    assert.equal(bBody.data.length, 0);

    const aEntry = (await auditLogs(`?action=ROLE_CREATED`)).data[0];
    const idor = await fetch(`${baseUrl}/api/v1/audit-logs/${aEntry.id}`, { headers: auth(ownerBToken) });
    assert.equal(idor.status, 404);
  });

  test("11. RBAC: employee without audit.view -> 403", async () => {
    const res = await fetch(`${baseUrl}/api/v1/audit-logs`, { headers: auth(noAuditToken) });
    assert.equal(res.status, 403);
  });

  test("12. unauthenticated -> 401", async () => {
    const res = await fetch(`${baseUrl}/api/v1/audit-logs`);
    assert.equal(res.status, 401);
  });
});
