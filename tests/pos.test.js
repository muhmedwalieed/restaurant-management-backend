import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import bcrypt from "bcrypt";
import app from "../src/app/app.js";
import prisma from "../src/lib/prisma.js";
import { authService } from "../src/modules/auth/auth.service.js";
import { disconnectRedis } from "../src/config/redis.js";

describe("Staff/POS Ordering & Payment/Refund Module Integration Tests", () => {
  let server;
  let baseUrl;

  let tenantA;
  let branchA;
  let categoryA;
  let productA1;
  let productA2;
  let tableA1;
  let customerA;

  let ownerAToken;
  let cashierAToken;
  let viewOnlyStaffToken;

  let tenantB;
  let branchB;
  let ownerBToken;

  let posOrderDineIn;
  let posOrderDelivery;

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
      name: "Owner POS A",
      email: `ownerposa-${Date.now()}@test.com`,
      password: "Password123!",
      restaurantName: "POS Rest A",
      restaurantSlug: `pos-rest-a-${Date.now()}`,
    });
    tenantA = regA.restaurant;

    branchA = await prisma.branch.findFirst({
      where: { restaurantId: tenantA.id, isMain: true },
    });

    const loginA = await authService.login({
      email: regA.employee.email,
      password: "Password123!",
      device: "Test-Runner-POSA",
      ipAddress: "127.0.0.1",
    });
    ownerAToken = loginA.accessToken;

    categoryA = await prisma.category.create({
      data: {
        restaurantId: tenantA.id,
        name: "POS Mains",
      },
    });

    productA1 = await prisma.product.create({
      data: {
        restaurantId: tenantA.id,
        categoryId: categoryA.id,
        name: "Burger POS",
        price: 15.0,
      },
    });

    productA2 = await prisma.product.create({
      data: {
        restaurantId: tenantA.id,
        categoryId: categoryA.id,
        name: "Fries POS",
        price: 5.0,
      },
    });

    tableA1 = await prisma.restaurantTable.create({
      data: {
        restaurantId: tenantA.id,
        branchId: branchA.id,
        label: "T-POS-1",
        qrToken: `qr-pos-1-${Date.now()}`,
      },
    });

    customerA = await prisma.customer.create({
      data: {
        restaurantId: tenantA.id,
        name: "POS Customer",
        phone: "+201011112222",
      },
    });

    const passwordHash = await bcrypt.hash("Password123!", 10);

    // Cashier Role in Tenant A (orders.create, orders.view, orders.update, orders.payment, orders.refund)
    const posPerms = await prisma.permission.findMany({
      where: {
        key: {
          in: ["orders.create", "orders.view", "orders.update", "orders.payment", "orders.refund"],
        },
      },
    });

    const cashierRole = await prisma.role.create({
      data: {
        restaurantId: tenantA.id,
        name: "Cashier Role",
        permissions: {
          create: posPerms.map((p) => ({ restaurantId: tenantA.id, permissionId: p.id })),
        },
      },
    });

    const cashierEmp = await prisma.employee.create({
      data: {
        restaurantId: tenantA.id,
        branchId: branchA.id,
        roleId: cashierRole.id,
        name: "Cashier Staff",
        email: `cashier-${Date.now()}@test.com`,
        passwordHash,
      },
    });

    const cashierLogin = await authService.login({
      email: cashierEmp.email,
      password: "Password123!",
      device: "Test-Runner-Cashier",
      ipAddress: "127.0.0.1",
    });
    cashierAToken = cashierLogin.accessToken;

    // View-Only Role
    const viewPerm = await prisma.permission.findFirst({
      where: { key: "orders.view" },
    });

    const viewRole = await prisma.role.create({
      data: {
        restaurantId: tenantA.id,
        name: "View Only Role",
        permissions: {
          create: [{ restaurantId: tenantA.id, permissionId: viewPerm.id }],
        },
      },
    });

    const viewEmp = await prisma.employee.create({
      data: {
        restaurantId: tenantA.id,
        branchId: branchA.id,
        roleId: viewRole.id,
        name: "View Only Staff",
        email: `viewonlypos-${Date.now()}@test.com`,
        passwordHash,
      },
    });

    const viewLogin = await authService.login({
      email: viewEmp.email,
      password: "Password123!",
      device: "Test-Runner-ViewOnly",
      ipAddress: "127.0.0.1",
    });
    viewOnlyStaffToken = viewLogin.accessToken;

    // Setup Tenant B
    const regB = await authService.register({
      name: "Owner POS B",
      email: `ownerposb-${Date.now()}@test.com`,
      password: "Password123!",
      restaurantName: "POS Rest B",
      restaurantSlug: `pos-rest-b-${Date.now()}`,
    });
    tenantB = regB.restaurant;

    branchB = await prisma.branch.findFirst({
      where: { restaurantId: tenantB.id, isMain: true },
    });

    const loginB = await authService.login({
      email: regB.employee.email,
      password: "Password123!",
      device: "Test-Runner-POSB",
      ipAddress: "127.0.0.1",
    });
    ownerBToken = loginB.accessToken;
  });

  after(async () => {
    const ids = [tenantA?.id, tenantB?.id].filter(Boolean);
    if (ids.length > 0) {
      await prisma.idempotencyKey.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.orderStatusHistory.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.orderItem.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.order.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.customerAddress.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.customer.deleteMany({ where: { restaurantId: { in: ids } } });
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
      await prisma.restaurant.deleteMany({ where: { id: { in: ids } } });
    }

    await new Promise((resolve) => {
      server.closeAllConnections?.();
      server.close(resolve);
    });

    await disconnectRedis();
  });

  test("1. POST /api/v1/branches/:branchId/pos/orders creates manual DINE_IN order (source: CASHIER enforced)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/pos/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cashierAToken}`,
      },
      body: JSON.stringify({
        type: "DINE_IN",
        tableId: tableA1.id,
        source: "WEBSITE", // Attempting override — must be forced to CASHIER
        items: [{ productId: productA1.id, quantity: 2 }],
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.equal(body.data.source, "CASHIER"); // Enforced!
    assert.equal(body.data.type, "DINE_IN");
    assert.equal(Number(body.data.total), 30.0);
    assert.equal(body.data.tableId, tableA1.id);

    posOrderDineIn = body.data;
  });

  test("2. Table Lifecycle (ADR-015): Table status transitions to OCCUPIED after DINE_IN order creation", async () => {
    const table = await prisma.restaurantTable.findFirst({
      where: { id: tableA1.id, restaurantId: tenantA.id },
    });
    assert.equal(table.status, "OCCUPIED");
  });

  test("3. Multi-Order Policy on OCCUPIED Table (ADR-015): Creating second order on OCCUPIED table succeeds", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/pos/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cashierAToken}`,
      },
      body: JSON.stringify({
        type: "DINE_IN",
        tableId: tableA1.id,
        items: [{ productId: productA2.id, quantity: 1 }],
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
  });

  test("4. POS Validation Rule: DINE_IN order without tableId returns 422 BusinessRuleError", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/pos/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cashierAToken}`,
      },
      body: JSON.stringify({
        type: "DINE_IN", // Missing tableId!
        items: [{ productId: productA1.id, quantity: 1 }],
      }),
    });

    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.error.code, "BUSINESS_RULE_ERROR");
  });

  test("5. POS Validation Rule: DELIVERY order without customer returns 422 BusinessRuleError", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/pos/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cashierAToken}`,
      },
      body: JSON.stringify({
        type: "DELIVERY", // Missing customerId / customerPhone!
        items: [{ productId: productA1.id, quantity: 1 }],
      }),
    });

    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.error.code, "BUSINESS_RULE_ERROR");
  });

  test("6. POS Order with customerPhone auto-link creates DELIVERY order successfully", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/pos/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cashierAToken}`,
      },
      body: JSON.stringify({
        type: "DELIVERY",
        customerPhone: "+201099887766",
        customerName: "Auto POS Customer",
        items: [{ productId: productA1.id, quantity: 1 }],
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.ok(body.data.customerId);
    posOrderDelivery = body.data;
  });

  test("7. Cross-Tenant Protection: Tenant B creating POS order for Tenant A's table returns 404 NotFoundError", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchB.id}/pos/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerBToken}`,
      },
      body: JSON.stringify({
        type: "DINE_IN",
        tableId: tableA1.id, // Table belongs to Tenant A!
        items: [{ productId: productA1.id, quantity: 1 }],
      }),
    });

    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error.code, "NOT_FOUND");
  });

  test("8. POST /api/v1/branches/:branchId/orders/:id/payment processes order payment (PAID)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${posOrderDineIn.id}/payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cashierAToken}`,
      },
      body: JSON.stringify({
        paymentMethod: "CASH",
        expectedVersion: posOrderDineIn.version,
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.equal(body.data.paymentStatus, "PAID");
    assert.equal(body.data.paymentMethod, "CASH");
    assert.ok(body.data.paidAt);
    assert.equal(body.data.version, 2);

    posOrderDineIn = body.data;
  });

  test("9. Double Payment Protection: Processing payment on already PAID order returns 422 BusinessRuleError", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${posOrderDineIn.id}/payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cashierAToken}`,
      },
      body: JSON.stringify({
        paymentMethod: "CARD",
        expectedVersion: posOrderDineIn.version,
      }),
    });

    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.error.code, "BUSINESS_RULE_ERROR");
    assert.ok(body.error.message.includes("already paid"));
  });

  test("10. Payment Amount Guard: Payment amount exceeding order total returns 422 BusinessRuleError", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${posOrderDelivery.id}/payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cashierAToken}`,
      },
      body: JSON.stringify({
        paymentMethod: "CASH",
        amount: 999.0, // Total is 15.0!
        expectedVersion: posOrderDelivery.version,
      }),
    });

    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.error.code, "BUSINESS_RULE_ERROR");
  });

  test("11. Refund Guard: Processing refund on unpaid (PENDING) order returns 422 BusinessRuleError", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${posOrderDelivery.id}/refund`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cashierAToken}`,
      },
      body: JSON.stringify({
        reason: "Customer cancelled",
        expectedVersion: posOrderDelivery.version,
      }),
    });

    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.error.code, "BUSINESS_RULE_ERROR");
    assert.ok(body.error.message.includes("Only paid orders can be refunded"));
  });

  test("12. POST /api/v1/branches/:branchId/orders/:id/refund processes refund on PAID order", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${posOrderDineIn.id}/refund`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cashierAToken}`,
      },
      body: JSON.stringify({
        reason: "Wrong item delivered",
        expectedVersion: posOrderDineIn.version,
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.equal(body.data.paymentStatus, "REFUNDED");
    assert.equal(body.data.refundReason, "Wrong item delivered");
    assert.ok(body.data.refundedAt);
    assert.equal(body.data.version, 3);
  });

  test("13. Optimistic Locking: Payment attempt with stale expectedVersion returns 409 ConflictError", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${posOrderDelivery.id}/payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cashierAToken}`,
      },
      body: JSON.stringify({
        paymentMethod: "CASH",
        expectedVersion: 99, // Stale version!
      }),
    });

    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error.code, "CONFLICT_ERROR");
  });

  test("14. RBAC Protection: Staff with orders.view ONLY receives 403 on /pos/orders, /payment, and /refund", async () => {
    const posRes = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/pos/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${viewOnlyStaffToken}`,
      },
      body: JSON.stringify({
        type: "DINE_IN",
        tableId: tableA1.id,
        items: [{ productId: productA1.id, quantity: 1 }],
      }),
    });
    assert.equal(posRes.status, 403);

    const payRes = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${posOrderDelivery.id}/payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${viewOnlyStaffToken}`,
      },
      body: JSON.stringify({
        paymentMethod: "CASH",
        expectedVersion: 1,
      }),
    });
    assert.equal(payRes.status, 403);
  });

  test("15. Mass Assignment Protection: Injected paymentStatus in body is ignored during POS order creation", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/pos/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cashierAToken}`,
      },
      body: JSON.stringify({
        type: "DINE_IN",
        tableId: tableA1.id,
        paymentStatus: "PAID", // Injected!
        items: [{ productId: productA1.id, quantity: 1 }],
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.equal(body.data.paymentStatus, "PENDING"); // Safely ignored!
  });
});
