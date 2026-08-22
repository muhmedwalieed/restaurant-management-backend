import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import app from "../src/app/app.js";
import prisma from "../src/lib/prisma.js";
import { authService } from "../src/modules/auth/auth.service.js";
import { disconnectRedis } from "../src/config/redis.js";

describe("Module 14 — Phone Ordering Integration Tests", () => {
  let server;
  let baseUrl;
  let tenantA;
  let branchA;
  let ownerToken;
  let categoryA;
  let productA;
  let customerPhone;

  before(async () => {
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
      name: "Owner Phone A",
      email: `phonea-${uniq}@test.com`,
      password: "Password123!",
      restaurantName: "Phone Rest A",
      restaurantSlug: `phone-a-${uniq}`,
    });
    tenantA = regA.restaurant;
    branchA = await prisma.branch.findFirst({ where: { restaurantId: tenantA.id, isMain: true } });
    const loginA = await authService.login({ email: regA.employee.email, password: "Password123!", device: "A", ipAddress: "127.0.0.1" });
    ownerToken = loginA.accessToken;
    const auth = { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` };

    categoryA = await prisma.category.create({ data: { restaurantId: tenantA.id, name: "Cat" } });
    productA = await prisma.product.create({
      data: { restaurantId: tenantA.id, categoryId: categoryA.id, name: "Prod", price: 20 },
    });

    customerPhone = "+201099990001";
    // Pre-create a customer with an order + default address for the lookup flow
    const customer = await prisma.customer.create({
      data: { restaurantId: tenantA.id, name: "Existing Phone Customer", phone: customerPhone },
    });
    await prisma.customerAddress.create({
      data: { restaurantId: tenantA.id, customerId: customer.id, label: "HOME", street: "شارع 1", city: "القاهرة", isDefault: true },
    });
    await prisma.order.create({
      data: {
        orderNumber: 1001,
        restaurantId: tenantA.id,
        branchId: branchA.id,
        source: "PHONE",
        type: "DELIVERY",
        status: "PENDING",
        customerId: customer.id,
        subtotal: 40,
        total: 40,
      },
    });
  });

  after(async () => {
    const ids = [tenantA?.id].filter(Boolean);
    if (ids.length > 0) {
      await prisma.orderStatusHistory.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.orderItem.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.order.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.customerAddress.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.customer.deleteMany({ where: { restaurantId: { in: ids } } });
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

  test("1. POST /v1/phone-order/lookup returns existing customer + recent orders + default address", async () => {
    const res = await fetch(`${baseUrl}/api/v1/phone-order/lookup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ phone: customerPhone }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.customer.phone, customerPhone);
    assert.equal(body.data.customer.name, "Existing Phone Customer");
    assert.equal(body.data.recentOrders.length, 1);
    assert.equal(body.data.recentOrders[0].orderNumber, 1001);
    assert.ok(body.data.defaultAddress);
    assert.equal(body.data.defaultAddress.city, "القاهرة");
  });

  test("2. POST /v1/phone-order/lookup auto-creates a NEW customer for an unknown phone", async () => {
    const res = await fetch(`${baseUrl}/api/v1/phone-order/lookup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ phone: "+201077770002" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.customer.phone, "+201077770002");
    assert.equal(body.data.recentOrders.length, 0);
    assert.equal(body.data.defaultAddress, null);
  });

  test("3. POST /v1/phone-order/branches/:branchId/orders creates a PHONE order linked to the customer + uses default address", async () => {
    const res = await fetch(`${baseUrl}/api/v1/phone-order/branches/${branchA.id}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        type: "DELIVERY",
        customerPhone,
        items: [{ productId: productA.id, quantity: 2 }],
      }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.data.source, "PHONE");
    assert.equal(Number(body.data.total), 40);
    assert.ok(body.data.notes.includes("شارع 1")); // default address injected
    const linked = await prisma.customer.findFirst({
      where: { restaurantId: tenantA.id, phone: customerPhone },
      include: { orders: true },
    });
    assert.ok(linked.orders.some((o) => o.id === body.data.id));
  });

  test("4. lookup validates missing phone -> 400", async () => {
    const res = await fetch(`${baseUrl}/api/v1/phone-order/lookup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, "VALIDATION_ERROR");
  });

  test("5. phone order requires items -> 400", async () => {
    const res = await fetch(`${baseUrl}/api/v1/phone-order/branches/${branchA.id}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ type: "DELIVERY", customerPhone, items: [] }),
    });
    assert.equal(res.status, 400);
  });

  test("6. unauthenticated -> 401", async () => {
    const res = await fetch(`${baseUrl}/api/v1/phone-order/lookup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: customerPhone }),
    });
    assert.equal(res.status, 401);
  });
});
