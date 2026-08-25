import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import app from "../src/app/app.js";
import prisma from "../src/lib/prisma.js";
import { authService } from "../src/modules/auth/auth.service.js";
import { disconnectRedis } from "../src/config/redis.js";

describe("Table Self-Ordering Sessions (Multi-Round Orders)", () => {
  let server;
  let baseUrl;

  let tenant;
  let branch;
  let ownerToken;
  let table;
  let product1;
  let product2;

  before(async () => {
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, () => {
        baseUrl = `http://localhost:${server.address().port}`;
        resolve();
      });
    });

    const reg = await authService.register({
      name: "Owner Sessions",
      email: `ownersessions-${Date.now()}@test.com`,
      password: "Password123!",
      restaurantName: "Sessions Rest",
      restaurantSlug: `sessions-rest-${Date.now()}`,
    });
    tenant = reg.restaurant;
    branch = await prisma.branch.findFirst({ where: { restaurantId: tenant.id, isMain: true } });

    const login = await authService.login({
      email: reg.employee.email,
      password: "Password123!",
      device: "Test-Runner-Sessions",
      ipAddress: "127.0.0.1",
    });
    ownerToken = login.accessToken;

    const tableRes = await fetch(`${baseUrl}/api/v1/branches/${branch.id}/tables`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ label: "S-01", capacity: 4 }),
    });
    table = (await tableRes.json()).data;

    const category = await prisma.category.create({ data: { restaurantId: tenant.id, name: "Sessions Cat" } });
    const p1 = await prisma.product.create({
      data: { restaurantId: tenant.id, categoryId: category.id, name: "Burger Sessions", price: 50 },
    });
    const p2 = await prisma.product.create({
      data: { restaurantId: tenant.id, categoryId: category.id, name: "Fries Sessions", price: 25 },
    });
    product1 = p1;
    product2 = p2;
  });

  after(async () => {
    const ids = [tenant?.id].filter(Boolean);
    if (ids.length > 0) {
      await prisma.tableSession.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.order.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.restaurantTable.deleteMany({ where: { restaurantId: { in: ids } } });
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

  test("1. Employee starts a session and gets a 4-digit PIN", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tables/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ tableId: table.id }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.sessionId);
    assert.match(body.data.pin, /^\d{4}$/);
    sessionState = { sessionId: body.data.sessionId, pin: body.data.pin };

    // Opening a session marks the table as OCCUPIED.
    const tableAfterStart = await prisma.restaurantTable.findFirst({
      where: { id: table.id, restaurantId: tenant.id },
    });
    assert.equal(tableAfterStart.status, "OCCUPIED");
  });

  test("2. Two customers join with name + PIN", async () => {
    const j1 = await fetch(`${baseUrl}/api/v1/sessions/${table.qrToken}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "أحمد", pin: sessionState.pin }),
    });
    assert.equal(j1.status, 200);
    const b1 = await j1.json();
    assert.equal(b1.success, true);
    assert.equal(b1.data.id, sessionState.sessionId);

    const j2 = await fetch(`${baseUrl}/api/v1/sessions/${table.qrToken}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "سارة", pin: sessionState.pin }),
    });
    assert.equal(j2.status, 200);
    assert.equal((await j2.json()).success, true);
  });

  test("3. Members add items to the shared cart", async () => {
    const a1 = await fetch(`${baseUrl}/api/v1/sessions/${sessionState.sessionId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: product1.id, quantity: 2, addedByName: "أحمد" }),
    });
    assert.equal(a1.status, 200);
    const a1Body = await a1.json();
    assert.equal(a1Body.data.total, 100);

    const a2 = await fetch(`${baseUrl}/api/v1/sessions/${sessionState.sessionId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: product2.id, quantity: 1, addedByName: "سارة" }),
    });
    assert.equal(a2.status, 200);
    const a2Body = await a2.json();
    assert.equal(a2Body.data.items.length, 2);
    assert.equal(a2Body.data.total, 125);
  });

  test("4. Submitting the draft creates order round #1 (AWAITING_CONFIRMATION) with per-member breakdown", async () => {
    const res = await fetch(`${baseUrl}/api/v1/sessions/${sessionState.sessionId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    const s = body.data;

    assert.equal(s.status, "AWAITING_CONFIRMATION");
    // Current cart is now empty (items moved into the order round)
    assert.equal(s.items.length, 0);
    assert.equal(s.total, 0);
    assert.equal(s.orders.length, 1);

    const order = s.orders[0];
    assert.equal(order.orderNumber, 1);
    assert.equal(order.status, "AWAITING_CONFIRMATION");
    assert.equal(order.total, 125);
    assert.equal(order.items.length, 2);

    // Per-member breakdown
    const ahmed = order.byMember.find((m) => m.name === "أحمد");
    const sara = order.byMember.find((m) => m.name === "سارة");
    assert.ok(ahmed, "member أحمد should have a bill row");
    assert.ok(sara, "member سارة should have a bill row");
    assert.equal(ahmed.subtotal, 100);
    assert.equal(ahmed.items[0].quantity, 2);
    assert.equal(sara.subtotal, 25);
    assert.equal(sara.items[0].quantity, 1);
  });

  test("5. Customers cannot add items while an order is awaiting confirmation", async () => {
    const res = await fetch(`${baseUrl}/api/v1/sessions/${sessionState.sessionId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: product1.id, quantity: 1, addedByName: "أحمد" }),
    });
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.error.code, "BUSINESS_RULE_ERROR");
  });

  test("6. Waiter confirms round #1 -> real order created, session returns to ACTIVE", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tables/${sessionState.sessionId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    const s = body.data;

    assert.equal(s.status, "ACTIVE"); // open for the next round
    assert.equal(s.orders.length, 1);
    const order = s.orders[0];
    assert.equal(order.status, "CONFIRMED");
    assert.ok(order.orderId, "real order id should be set");
    assert.ok(order.confirmedAt);
    assert.equal(s.confirmedOrderId, order.orderId);

    // The real order exists in the orders table
    const realOrder = await prisma.order.findFirst({
      where: { id: order.orderId, restaurantId: tenant.id },
    });
    assert.ok(realOrder);
    assert.equal(realOrder.source, "QR");
    assert.equal(realOrder.tableId, table.id);
    assert.equal(Number(realOrder.total), 125);
  });

  test("7. Customers can place a second round after confirmation", async () => {
    // Round 2: new items allowed again
    const a1 = await fetch(`${baseUrl}/api/v1/sessions/${sessionState.sessionId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: product1.id, quantity: 1, addedByName: "سارة" }),
    });
    assert.equal(a1.status, 200);
    assert.equal((await a1.json()).data.total, 50);

    const sub = await fetch(`${baseUrl}/api/v1/sessions/${sessionState.sessionId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    assert.equal(sub.status, 200);
    const subBody = await sub.json();
    assert.equal(subBody.data.status, "AWAITING_CONFIRMATION");
    assert.equal(subBody.data.orders.length, 2);
    assert.equal(subBody.data.orders[1].orderNumber, 2);
    assert.equal(subBody.data.orders[1].status, "AWAITING_CONFIRMATION");
    assert.equal(subBody.data.orders[1].total, 50);
  });

  test("8. Confirming round #2 keeps the history of both orders in ONE real order", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tables/${sessionState.sessionId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
    });
    assert.equal(res.status, 200);
    const s = (await res.json()).data;

    assert.equal(s.status, "ACTIVE");
    assert.equal(s.orders.length, 2);
    assert.deepEqual(
      s.orders.map((o) => o.status),
      ["CONFIRMED", "CONFIRMED"]
    );
    assert.equal(s.orders[1].byMember[0].name, "سارة");

    // Both rounds must reference the SAME real order (one order per session).
    assert.equal(s.orders[0].orderId, s.orders[1].orderId);
    assert.equal(s.confirmedOrderId, s.orders[0].orderId);

    // The single real order holds the items of BOTH rounds and the running total.
    const realOrder = await prisma.order.findFirst({
      where: { id: s.orders[0].orderId, restaurantId: tenant.id },
      include: { items: true },
    });
    assert.ok(realOrder);
    assert.equal(realOrder.items.length, 3); // 2 (round 1) + 1 (round 2)
    assert.equal(Number(realOrder.subtotal), 175); // 125 + 50
    assert.equal(Number(realOrder.total), 175);
  });

  test("9. Items of a confirmed order round cannot be edited", async () => {
    const s = (await (await fetch(`${baseUrl}/api/v1/sessions/${sessionState.sessionId}`)).json()).data;
    const confirmedOrder = s.orders[0];
    const itemId = confirmedOrder.items[0].id;

    const res = await fetch(`${baseUrl}/api/v1/sessions/${sessionState.sessionId}/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: 5 }),
    });
    assert.equal(res.status, 422);
    assert.equal((await res.json()).error.code, "BUSINESS_RULE_ERROR");
  });

  test("10. Closing the session locks ordering; submit after close is rejected", async () => {
    const close = await fetch(`${baseUrl}/api/v1/tables/${sessionState.sessionId}/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
    });
    assert.equal(close.status, 200);
    assert.equal((await close.json()).data.status, "CLOSED");

    // Closing the session frees the table back to AVAILABLE.
    const tableAfterClose = await prisma.restaurantTable.findFirst({
      where: { id: table.id, restaurantId: tenant.id },
    });
    assert.equal(tableAfterClose.status, "AVAILABLE");

    const sub = await fetch(`${baseUrl}/api/v1/sessions/${sessionState.sessionId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    assert.equal(sub.status, 422);
  });

  test("11. Staff endpoint returns the session PIN; public endpoint never leaks it", async () => {
    // Start a fresh session so there is a PIN to expose.
    const start = await fetch(`${baseUrl}/api/v1/tables/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ tableId: table.id }),
    });
    assert.equal(start.status, 201);
    const started = (await start.json()).data;
    assert.match(started.pin, /^\d{4}$/);

    // Staff projection (GET /tables/table/:tableId/session) includes the PIN.
    const staff = await fetch(`${baseUrl}/api/v1/tables/table/${table.id}/session`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    assert.equal(staff.status, 200);
    const staffBody = await staff.json();
    assert.equal(staffBody.data.pin, started.pin);

    // Public projection (GET /sessions/:id) must NOT include the PIN.
    const pub = await fetch(`${baseUrl}/api/v1/sessions/${started.sessionId}`);
    assert.equal(pub.status, 200);
    const pubBody = await pub.json();
    assert.equal(pubBody.data.pin, undefined);

    // Cleanup this extra session.
    await prisma.tableSession.deleteMany({ where: { id: started.sessionId } });
  });

  test("12. Staff can regenerate a PIN for an open session (fixes legacy null-pin sessions)", async () => {
    const start = await fetch(`${baseUrl}/api/v1/tables/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ tableId: table.id }),
    });
    const started = (await start.json()).data;

    // Force the stored PIN to null to simulate a legacy session.
    await prisma.tableSession.update({ where: { id: started.sessionId }, data: { pin: null } });

    const regen = await fetch(`${baseUrl}/api/v1/tables/${started.sessionId}/regenerate-pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
    });
    assert.equal(regen.status, 200);
    const regenBody = await regen.json();
    assert.equal(regenBody.data.sessionId, started.sessionId);
    assert.match(regenBody.data.pin, /^\d{4}$/);
    assert.notEqual(regenBody.data.pin, started.pin);

    // Staff view now exposes the regenerated PIN.
    const staff = await fetch(`${baseUrl}/api/v1/tables/table/${table.id}/session`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const staffBody = await staff.json();
    assert.equal(staffBody.data.pin, regenBody.data.pin);

    // Cleanup.
    await prisma.tableSession.deleteMany({ where: { id: started.sessionId } });
  });

  test("13. Cart quantity update and item removal work on an open session", async () => {
    const start = await fetch(`${baseUrl}/api/v1/tables/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ tableId: table.id }),
    });
    const { sessionId, pin } = (await start.json()).data;

    await fetch(`${baseUrl}/api/v1/sessions/${table.qrToken}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "كريم", pin }),
    });
    const add = await fetch(`${baseUrl}/api/v1/sessions/${sessionId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: product1.id, quantity: 1, addedByName: "كريم" }),
    });
    const addBody = await add.json();
    assert.equal(add.status, 200);
    const itemId = addBody.data.items[0].id;

    // Update quantity to 3 → total 150
    const up = await fetch(`${baseUrl}/api/v1/sessions/${sessionId}/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: 3 }),
    });
    assert.equal(up.status, 200);
    const upBody = await up.json();
    const updated = upBody.data.items.find((i) => i.id === itemId);
    assert.equal(updated.quantity, 3);
    assert.equal(Number(updated.total), 150);
    assert.equal(upBody.data.total, 150);

    // Remove the item → empty cart
    const rm = await fetch(`${baseUrl}/api/v1/sessions/${sessionId}/items/${itemId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });
    assert.equal(rm.status, 200);
    assert.equal((await rm.json()).data.items.length, 0);

    await prisma.tableSession.deleteMany({ where: { id: sessionId } });
  });
});

let sessionState = {};