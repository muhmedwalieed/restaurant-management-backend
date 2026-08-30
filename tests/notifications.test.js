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

describe("Module 17 — Notifications Integration Tests", () => {
  let server;
  let baseUrl;
  let tenantA;
  let branchA;
  let ownerToken;
  let ownerId;
  let employeeX;
  let employeeXToken;
  let noPermToken;
  let tenantB;
  let ownerBToken;
  let productA;

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
      name: "Owner Notif A",
      email: `notifa-${uniq}@test.com`,
      password: "Password123!",
      restaurantName: "Notif Rest A",
      restaurantSlug: `notif-a-${uniq}`,
    });
    tenantA = regA.restaurant;
    ownerId = regA.employee.id;
    branchA = await prisma.branch.findFirst({ where: { restaurantId: tenantA.id, isMain: true } });
    const loginA = await authService.login({ email: regA.employee.email, password: "Password123!", device: "A", ipAddress: "127.0.0.1" });
    ownerToken = loginA.accessToken;

    const cat = await prisma.category.create({ data: { restaurantId: tenantA.id, name: "Cat" } });
    productA = await prisma.product.create({ data: { restaurantId: tenantA.id, categoryId: cat.id, name: "Burger", price: 100 } });

    const passwordHash = await bcrypt.hash("Password123!", 10);

    const notifPerm = await prisma.permission.findFirst({ where: { key: "notifications.view" } });
    const agentRole = await prisma.role.create({
      data: {
        restaurantId: tenantA.id,
        name: "Agent Role",
        description: "notifications.view only",
        permissions: { create: [{ restaurantId: tenantA.id, permissionId: notifPerm.id }] },
      },
    });
    employeeX = await prisma.employee.create({
      data: { restaurantId: tenantA.id, branchId: branchA.id, roleId: agentRole.id, name: "Agent X", email: `agentx-${uniq}@test.com`, passwordHash },
    });
    const loginX = await authService.login({ email: employeeX.email, password: "Password123!", device: "X", ipAddress: "127.0.0.1" });
    employeeXToken = loginX.accessToken;

    const noPermRole = await prisma.role.create({ data: { restaurantId: tenantA.id, name: "No Notif Role", description: "no notif permission" } });
    const noPermEmp = await prisma.employee.create({
      data: { restaurantId: tenantA.id, branchId: branchA.id, roleId: noPermRole.id, name: "No Notif", email: `nonotif-${uniq}@test.com`, passwordHash },
    });
    const noPermLogin = await authService.login({ email: noPermEmp.email, password: "Password123!", device: "NoNotif", ipAddress: "127.0.0.1" });
    noPermToken = noPermLogin.accessToken;

    const regB = await authService.register({
      name: "Owner Notif B",
      email: `notifb-${uniq}@test.com`,
      password: "Password123!",
      restaurantName: "Notif Rest B",
      restaurantSlug: `notif-b-${uniq}`,
    });
    tenantB = regB.restaurant;
    const loginB = await authService.login({ email: regB.employee.email, password: "Password123!", device: "B", ipAddress: "127.0.0.1" });
    ownerBToken = loginB.accessToken;
  });

  after(async () => {
    for (const tenant of [tenantA, tenantB]) {
      if (!tenant) continue;
      const id = tenant.id;
      await prisma.notification.deleteMany({ where: { restaurantId: id } });
      await prisma.notificationPreference.deleteMany({ where: { restaurantId: id } });
      await prisma.inboxMessage.deleteMany({ where: { restaurantId: id } });
      await prisma.inboxConversation.deleteMany({ where: { restaurantId: id } });
      await prisma.orderStatusHistory.deleteMany({ where: { restaurantId: id } });
      await prisma.orderItem.deleteMany({ where: { restaurantId: id } });
      await prisma.order.deleteMany({ where: { restaurantId: id } });
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
      await prisma.auditLog.deleteMany({ where: { restaurantId: id } });
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

  const myNotifications = (token, query = "") =>
    fetch(`${baseUrl}/api/v1/notifications${query}`, { headers: auth(token) }).then((r) => r.json());

  test("1. placing an order creates an ORDER_CREATED notification for branch employees", async () => {
    const res = await placeOrder({ type: "PICKUP", items: [{ productId: productA.id, quantity: 1 }] });
    assert.equal(res.status, 201);
    const order = (await res.json()).data;

    await waitFor(async () => (await myNotifications(ownerToken, `?type=ORDER_CREATED`)).data.some((n) => n.referenceId === order.id));
    const body = await myNotifications(ownerToken, `?type=ORDER_CREATED`);
    const found = body.data.find((n) => n.referenceId === order.id);
    assert.ok(found, "ORDER_CREATED notification should reference the new order");
    assert.equal(found.type, "ORDER_CREATED");

    await waitFor(async () => (await myNotifications(employeeXToken, `?type=ORDER_CREATED`)).data.some((n) => n.referenceId === order.id));
    const agentBody = await myNotifications(employeeXToken, `?type=ORDER_CREATED`);
    assert.ok(agentBody.data.some((n) => n.referenceId === order.id));
  });

  test("2. order status change creates an ORDER_STATUS_CHANGED notification", async () => {
    const res = await placeOrder({ type: "PICKUP", items: [{ productId: productA.id, quantity: 1 }] });
    const order = (await res.json()).data;

    const patch = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${order.id}/status`, {
      method: "PATCH",
      headers: auth(ownerToken),
      body: JSON.stringify({ newStatus: "CONFIRMED", expectedVersion: order.version }),
    });
    assert.equal(patch.status, 200);

    await waitFor(async () => (await myNotifications(ownerToken, `?type=ORDER_STATUS_CHANGED`)).data.some((n) => n.referenceId === order.id && n.body.includes("CONFIRMED")));
  });

  test("3. order payment creates an ORDER_PAID notification", async () => {
    const res = await placeOrder({ type: "PICKUP", items: [{ productId: productA.id, quantity: 1 }] });
    const order = (await res.json()).data;

    const pay = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${order.id}/payment`, {
      method: "POST",
      headers: auth(ownerToken),
      body: JSON.stringify({ paymentMethod: "CASH", amount: Number(order.total), expectedVersion: order.version }),
    });
    assert.equal(pay.status, 200);

    await waitFor(async () => (await myNotifications(ownerToken, `?type=ORDER_PAID`)).data.some((n) => n.referenceId === order.id));
  });

  test("4. unread-count endpoint reflects pending notifications", async () => {
    await waitFor(async () => (await myNotifications(ownerToken, `/unread-count`)).data.count >= 3);
  });

  test("5. marking one notification as read decreases the unread count", async () => {
    const unreadBefore = (await myNotifications(ownerToken, `/unread-count`)).data.count;
    const list = (await myNotifications(ownerToken, `?unreadOnly=true`)).data;
    const target = list.find((n) => n.isRead === false);
    assert.ok(target);

    const read = await fetch(`${baseUrl}/api/v1/notifications/${target.id}/read`, {
      method: "PATCH",
      headers: auth(ownerToken),
    });
    assert.equal(read.status, 200);

    const unreadAfter = (await myNotifications(ownerToken, `/unread-count`)).data.count;
    assert.equal(unreadAfter, unreadBefore - 1);
  });

  test("6. read-all marks every notification read", async () => {
    const readAll = await fetch(`${baseUrl}/api/v1/notifications/read-all`, {
      method: "POST",
      headers: auth(ownerToken),
    });
    assert.equal(readAll.status, 200);

    const body = await myNotifications(ownerToken, `/unread-count`);
    assert.equal(body.data.count, 0);
  });

  test("7. employee cannot mark ANOTHER employee's notification as read (IDOR -> 404)", async () => {
    const ownerList = (await myNotifications(ownerToken)).data;
    assert.ok(ownerList.length > 0);
    const ownerNotifId = ownerList[0].id;

    const res = await fetch(`${baseUrl}/api/v1/notifications/${ownerNotifId}/read`, {
      method: "PATCH",
      headers: auth(employeeXToken),
    });
    assert.equal(res.status, 404);
  });

  test("8. RBAC: employee without notifications.view -> 403", async () => {
    const res = await fetch(`${baseUrl}/api/v1/notifications`, { headers: auth(noPermToken) });
    assert.equal(res.status, 403);
  });

  test("9. unauthenticated -> 401", async () => {
    const res = await fetch(`${baseUrl}/api/v1/notifications`);
    assert.equal(res.status, 401);
  });

  test("10. cross-tenant: tenant B has no tenant A notifications", async () => {
    const body = await myNotifications(ownerBToken);
    assert.equal(body.data.length, 0);
  });

  test("11. preferences GET/PUT round-trip", async () => {
    const put = await fetch(`${baseUrl}/api/v1/notifications/preferences`, {
      method: "PUT",
      headers: auth(ownerToken),
      body: JSON.stringify({ disabledTypes: ["ORDER_CREATED"] }),
    });
    assert.equal(put.status, 200);
    const putBody = await put.json();
    assert.deepEqual(putBody.data.disabledTypes, ["ORDER_CREATED"]);

    const get = await myNotifications(ownerToken, `/preferences`);
    assert.deepEqual(get.data.disabledTypes, ["ORDER_CREATED"]);
  });

  test("12. disabled ORDER_CREATED suppresses the notification for that employee only", async () => {
    const res = await placeOrder({ type: "PICKUP", items: [{ productId: productA.id, quantity: 1 }] });
    const order = (await res.json()).data;

    await waitFor(async () => (await myNotifications(employeeXToken, `?type=ORDER_CREATED`)).data.some((n) => n.referenceId === order.id));

    const ownerBody = await myNotifications(ownerToken, `?type=ORDER_CREATED`);
    assert.ok(!ownerBody.data.some((n) => n.referenceId === order.id), "owner should not receive ORDER_CREATED");

    const agentBody = await myNotifications(employeeXToken, `?type=ORDER_CREATED`);
    assert.ok(agentBody.data.some((n) => n.referenceId === order.id));
  });

  test("13. mass assignment: disabledTypes is whitelisted (invalid type rejected -> 400)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/notifications/preferences`, {
      method: "PUT",
      headers: auth(ownerToken),
      body: JSON.stringify({ disabledTypes: ["NOT_A_TYPE"], targetEmployeeId: tenantB.id }),
    });
    assert.equal(res.status, 400);
  });

  test("14. assigning a conversation notifies the assigned agent (CHAT_ASSIGNED)", async () => {
    const conv = await prisma.inboxConversation.create({
      data: { restaurantId: tenantA.id, customerPhone: "+201000000002" },
    });

    const assign = await fetch(`${baseUrl}/api/v1/inbox/conversations/${conv.id}/assign`, {
      method: "POST",
      headers: auth(ownerToken),
      body: JSON.stringify({ agentId: employeeX.id }),
    });
    assert.equal(assign.status, 200);

    await waitFor(async () => (await myNotifications(employeeXToken, `?type=CHAT_ASSIGNED`)).data.some((n) => n.referenceId === conv.id));
    const body = await myNotifications(employeeXToken, `?type=CHAT_ASSIGNED`);
    assert.ok(body.data.some((n) => n.referenceId === conv.id));
    assert.ok(body.data.some((n) => n.body.includes("+201000000002")));
  });
});
