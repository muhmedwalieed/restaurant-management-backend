import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import bcrypt from "bcrypt";
import app from "../src/app/app.js";
import prisma from "../src/lib/prisma.js";
import { authService } from "../src/modules/auth/auth.service.js";
import { staffLogin } from "./helpers/staff-login.js";
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

    const loginA = await staffLogin({
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

    const posPerms = await prisma.permission.findMany({
      where: {
        key: {
          in: [
            "orders.create",
            "orders.view",
            "orders.update",
            "orders.payment",
            "orders.refund",
            "orders.source_cashier",
            "orders.source_phone",
            "orders.source_whatsapp",
            "orders.source_website",
            "tables.view",
            "tables.manage",
          ],
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

    const cashierLogin = await staffLogin({
      email: cashierEmp.email,
      password: "Password123!",
      device: "Test-Runner-Cashier",
      ipAddress: "127.0.0.1",
    });
    cashierAToken = cashierLogin.accessToken;

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

    const viewLogin = await staffLogin({
      email: viewEmp.email,
      password: "Password123!",
      device: "Test-Runner-ViewOnly",
      ipAddress: "127.0.0.1",
    });
    viewOnlyStaffToken = viewLogin.accessToken;

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

    const loginB = await staffLogin({
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
      await prisma.auditLog.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.restaurant.deleteMany({ where: { id: { in: ids } } });
    }

    await new Promise((resolve) => {
      server.closeAllConnections?.();
      server.close(resolve);
    });

    await disconnectRedis();
  });

  test("1. POST /api/v1/branches/:branchId/pos/orders creates manual DINE_IN order (default source: CASHIER)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/pos/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cashierAToken}`,
      },
      body: JSON.stringify({
        type: "DINE_IN",
        tableId: tableA1.id,
        items: [{ productId: productA1.id, quantity: 2 }],
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.equal(body.data.source, "CASHIER");
    assert.equal(body.data.type, "DINE_IN");
    assert.equal(Number(body.data.total), 30.0);
    assert.equal(body.data.tableId, tableA1.id);

    posOrderDineIn = body.data;
  });

  test("1a. POST /pos/orders honours a caller-supplied source (e.g. PHONE for a mobile order)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/pos/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cashierAToken}`,
      },
      body: JSON.stringify({
        type: "DELIVERY",
        customerPhone: "+201099990009",
        customerName: "Source Test",
        address: "ميدان التحرير",
        source: "PHONE",
        items: [{ productId: productA1.id, quantity: 1 }],
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.data.source, "PHONE");
  });

  test("2. Table Lifecycle (ADR-015): Table status transitions to OCCUPIED after DINE_IN order creation", async () => {
    const table = await prisma.restaurantTable.findFirst({
      where: { id: tableA1.id, restaurantId: tenantA.id },
    });
    assert.equal(table.status, "OCCUPIED");
  });

  test("3. Multiple Orders Per Table: Creating a second order on an OCCUPIED table succeeds (201)", async () => {
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
    assert.equal(body.data.tableId, tableA1.id);

    const activeOnTable = await prisma.order.count({
      where: {
        restaurantId: tenantA.id,
        branchId: branchA.id,
        tableId: tableA1.id,
        status: { notIn: ["DELIVERED", "CANCELLED"] },
      },
    });
    assert.ok(activeOnTable >= 2, `expected >= 2 active orders on the table, got ${activeOnTable}`);
  });

  test("3a. New order on a table AFTER its active order is cancelled succeeds (201)", async () => {

    const cancelRes = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${posOrderDineIn.id}/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        expectedVersion: posOrderDineIn.version,
        reason: "Test: free the table",
      }),
    });
    assert.equal(cancelRes.status, 200);

    const newOrderRes = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/pos/orders`, {
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

    assert.equal(newOrderRes.status, 201);
    posOrderDineIn = (await newOrderRes.json()).data;
  });

  test("4. POS Validation Rule: DINE_IN order without tableId returns 400 Validation Error", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/pos/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cashierAToken}`,
      },
      body: JSON.stringify({
        type: "DINE_IN",
        items: [{ productId: productA1.id, quantity: 1 }],
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, "VALIDATION_ERROR");
  });

  test("5. POS Validation Rule: DELIVERY order without customer returns 400 Validation Error", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/pos/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cashierAToken}`,
      },
      body: JSON.stringify({
        type: "DELIVERY",
        items: [{ productId: productA1.id, quantity: 1 }],
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, "VALIDATION_ERROR");
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
        address: "ش الزمالك",
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
        tableId: tableA1.id,
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
        amount: Number(posOrderDineIn.total),
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
        amount: Number(posOrderDineIn.total),
        expectedVersion: posOrderDineIn.version,
      }),
    });

    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.error.code, "BUSINESS_RULE_ERROR");
    assert.ok(body.error.message.includes("already paid"));
  });

  test("10. Payment Amount Guard: Overpayment exceeding order balance returns 422 BusinessRuleError", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${posOrderDelivery.id}/payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cashierAToken}`,
      },
      body: JSON.stringify({
        paymentMethod: "CASH",
        amount: 999.0,
        expectedVersion: posOrderDelivery.version,
      }),
    });

    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.error.code, "BUSINESS_RULE_ERROR");
  });

  test("10b. Partial Payment Lifecycle: Partial payment transitions to PARTIAL then PAID via INSTAPAY and WALLET", async () => {
    // Total is 15.0. Pay 10.0 via INSTAPAY
    const pay1Res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${posOrderDelivery.id}/payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cashierAToken}`,
        "Idempotency-Key": `pay-part-1-${Date.now()}`,
      },
      body: JSON.stringify({
        paymentMethod: "INSTAPAY",
        amount: 10.0,
        expectedVersion: posOrderDelivery.version,
      }),
    });

    assert.equal(pay1Res.status, 200);
    const pay1Body = await pay1Res.json();
    assert.equal(pay1Body.success, true);
    assert.equal(pay1Body.data.paymentStatus, "PARTIAL");
    assert.equal(Number(pay1Body.data.amountPaid), 10.0);
    assert.equal(pay1Body.data.paymentMethod, "INSTAPAY");

    posOrderDelivery = pay1Body.data;

    // Second partial payment: Pay remaining 5.0 via WALLET
    const pay2Res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${posOrderDelivery.id}/payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cashierAToken}`,
        "Idempotency-Key": `pay-part-2-${Date.now()}`,
      },
      body: JSON.stringify({
        paymentMethod: "WALLET",
        amount: 5.0,
        expectedVersion: posOrderDelivery.version,
      }),
    });

    assert.equal(pay2Res.status, 200);
    const pay2Body = await pay2Res.json();
    assert.equal(pay2Body.success, true);
    assert.equal(pay2Body.data.paymentStatus, "PAID");
    assert.equal(Number(pay2Body.data.amountPaid), 15.0);
    assert.equal(pay2Body.data.paymentMethod, "WALLET");

    posOrderDelivery = pay2Body.data;
  });

  test("10c. Payment Idempotency Guard: Repeating same payment request returns existing order without extra payment", async () => {
    const key = `idem-pay-${Date.now()}`;
    // Create a new order for idempotency test
    const newOrdRes = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/pos/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cashierAToken}`,
      },
      body: JSON.stringify({
        type: "PICKUP",
        customerName: "Idem Cust",
        customerPhone: "+201011223344",
        items: [{ productId: productA1.id, quantity: 1 }],
      }),
    });
    assert.equal(newOrdRes.status, 201);
    const newOrd = (await newOrdRes.json()).data;

    // Send payment with idempotency key
    const payRes1 = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${newOrd.id}/payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cashierAToken}`,
        "Idempotency-Key": key,
      },
      body: JSON.stringify({
        paymentMethod: "CARD",
        amount: 15.0,
        expectedVersion: newOrd.version,
      }),
    });
    assert.equal(payRes1.status, 200);

    // Resend exact same payment with same idempotency key
    const payRes2 = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${newOrd.id}/payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cashierAToken}`,
        "Idempotency-Key": key,
      },
      body: JSON.stringify({
        paymentMethod: "CARD",
        amount: 15.0,
        expectedVersion: newOrd.version,
      }),
    });
    assert.equal(payRes2.status, 200);

    // Verify only 1 OrderPayment record was created
    const payments = await prisma.orderPayment.findMany({
      where: { restaurantId: tenantA.id, orderId: newOrd.id },
    });
    assert.equal(payments.length, 1);
  });

  test("11. Refund Guard: Processing refund on unpaid (PENDING) order returns 422 BusinessRuleError", async () => {
    const pendingOrderRes = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/pos/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cashierAToken}`,
      },
      body: JSON.stringify({
        type: "PICKUP",
        customerName: "Pending Customer",
        customerPhone: "+201088776655",
        items: [{ productId: productA2.id, quantity: 1 }],
      }),
    });
    assert.equal(pendingOrderRes.status, 201);
    const pendingOrder = (await pendingOrderRes.json()).data;

    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${pendingOrder.id}/refund`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cashierAToken}`,
      },
      body: JSON.stringify({
        reason: "Customer cancelled",
        expectedVersion: pendingOrder.version,
      }),
    });

    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.error.code, "BUSINESS_RULE_ERROR");
    assert.ok(body.error.message.includes("Only paid"));
  });

  test("12. POST /api/v1/branches/:branchId/orders/:id/refund processes refund on PAID order and sets amountPaid=0", async () => {
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
    assert.equal(Number(body.data.amountPaid), 0.0);
    assert.equal(body.data.refundReason, "Wrong item delivered");
    assert.ok(body.data.refundedAt);
    assert.equal(body.data.version, 3);
  });

  test("13. Optimistic Locking: Payment attempt with stale expectedVersion returns 409 ConflictError", async () => {
    const freshOrderRes = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/pos/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cashierAToken}`,
      },
      body: JSON.stringify({
        type: "PICKUP",
        customerName: "Stale Version Cust",
        customerPhone: "+201077665544",
        items: [{ productId: productA1.id, quantity: 1 }],
      }),
    });
    assert.equal(freshOrderRes.status, 201);
    const freshOrder = (await freshOrderRes.json()).data;

    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${freshOrder.id}/payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cashierAToken}`,
      },
      body: JSON.stringify({
        paymentMethod: "CASH",
        amount: Number(freshOrder.total),
        expectedVersion: 99,
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
        amount: Number(posOrderDelivery.total),
        expectedVersion: 1,
      }),
    });
    assert.equal(payRes.status, 403);
  });

  test("15. Mass Assignment Protection: Injected paymentStatus in body is ignored during POS order creation", async () => {
    const freshTable = await prisma.restaurantTable.create({
      data: { restaurantId: tenantA.id, branchId: branchA.id, label: `T-mass-${Date.now()}`, qrToken: `qr-mass-${Date.now()}` },
    });
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/pos/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cashierAToken}`,
      },
      body: JSON.stringify({
        type: "DINE_IN",
        tableId: freshTable.id,
        paymentStatus: "PAID",
        items: [{ productId: productA1.id, quantity: 1 }],
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.equal(body.data.paymentStatus, "PENDING");
  });

  test("16. Payment Guard: Payment on cancelled order returns 422 BusinessRuleError", async () => {
    const cancelledOrder = await prisma.order.create({
      data: {
        orderDate: "2026-08-25",
        orderNumber: 3100,
        restaurantId: tenantA.id,
        branchId: branchA.id,
        source: "CASHIER",
        type: "DINE_IN",
        status: "CANCELLED",
        paymentStatus: "PENDING",
        tableId: tableA1.id,
        subtotal: 15.0,
        total: 15.0,
        cancelReason: "Test cancellation",
      },
    });

    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${cancelledOrder.id}/payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cashierAToken}`,
      },
      body: JSON.stringify({
        paymentMethod: "CASH",
        amount: 15.0,
        expectedVersion: cancelledOrder.version,
      }),
    });

    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.error.code, "BUSINESS_RULE_ERROR");
    assert.ok(body.error.message.includes("cancelled"));
  });

  test("17. Payment Guard: Payment on refunded order returns 422 BusinessRuleError", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${posOrderDineIn.id}/payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cashierAToken}`,
      },
      body: JSON.stringify({
        paymentMethod: "CASH",
        amount: Number(posOrderDineIn.total),
        expectedVersion: posOrderDineIn.version,
      }),
    });

    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.error.code, "BUSINESS_RULE_ERROR");
    assert.ok(body.error.message.includes("refunded"));
  });

  test("18. Refund Guard: Refund without reason returns 400 Validation Error", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${posOrderDelivery.id}/refund`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cashierAToken}`,
      },
      body: JSON.stringify({
        expectedVersion: posOrderDelivery.version,
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, "VALIDATION_ERROR");
  });

  test("19. Cross-Tenant Protection: Tenant B cannot pay or refund Tenant A's order (404)", async () => {
    const payRes = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${posOrderDelivery.id}/payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerBToken}`,
      },
      body: JSON.stringify({
        paymentMethod: "CASH",
        amount: Number(posOrderDelivery.total),
        expectedVersion: posOrderDelivery.version,
      }),
    });
    assert.equal(payRes.status, 404);
    const payBody = await payRes.json();
    assert.equal(payBody.error.code, "NOT_FOUND");

    const refundRes = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${posOrderDelivery.id}/refund`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerBToken}`,
      },
      body: JSON.stringify({
        reason: "Cross tenant refund attempt",
        expectedVersion: posOrderDelivery.version,
      }),
    });
    assert.equal(refundRes.status, 404);
    const refundBody = await refundRes.json();
    assert.equal(refundBody.error.code, "NOT_FOUND");
  });

  test("20. RBAC Protection: Staff with orders.view ONLY receives 403 on /refund", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${posOrderDelivery.id}/refund`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${viewOnlyStaffToken}`,
      },
      body: JSON.stringify({
        reason: "Unauthorized refund",
        expectedVersion: 1,
      }),
    });

    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error.code, "AUTHORIZATION_ERROR");
  });

  test("21. Payment Method Guard: ONLINE payment method returns 400 Validation Error", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${posOrderDineIn.id}/payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cashierAToken}`,
      },
      body: JSON.stringify({
        paymentMethod: "ONLINE",
        amount: 10.0,
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, "VALIDATION_ERROR");
  });

  test("22. Payment Amount Guard: Zero and negative payment amount returns 400 Validation Error", async () => {
    const zeroRes = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${posOrderDineIn.id}/payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cashierAToken}`,
      },
      body: JSON.stringify({
        paymentMethod: "CASH",
        amount: 0,
      }),
    });
    assert.equal(zeroRes.status, 400);

    const negRes = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${posOrderDineIn.id}/payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cashierAToken}`,
      },
      body: JSON.stringify({
        paymentMethod: "CASH",
        amount: -10,
      }),
    });
    assert.equal(negRes.status, 400);
  });

  test("23. Table Permission Guard: Staff with orders.create but WITHOUT tables.view creating DINE_IN order is rejected (403)", async () => {
    const noTablePerms = await prisma.permission.findMany({
      where: { key: { in: ["orders.create", "orders.source_cashier"] } },
    });
    const noTableRole = await prisma.role.create({
      data: {
        restaurantId: tenantA.id,
        name: `No Tables Role ${Date.now()}`,
        permissions: {
          create: noTablePerms.map((p) => ({ restaurantId: tenantA.id, permissionId: p.id })),
        },
      },
    });
    const passwordHash = await bcrypt.hash("Password123!", 10);
    const noTableEmp = await prisma.employee.create({
      data: {
        restaurantId: tenantA.id,
        branchId: branchA.id,
        roleId: noTableRole.id,
        name: "No Table Staff",
        email: `notable-${Date.now()}@test.com`,
        passwordHash,
      },
    });
    const login = await staffLogin({
      email: noTableEmp.email,
      password: "Password123!",
      device: "Test-NoTable",
      ipAddress: "127.0.0.1",
    });

    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/pos/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${login.accessToken}`,
      },
      body: JSON.stringify({
        type: "DINE_IN",
        tableId: tableA1.id,
        items: [{ productId: productA1.id, quantity: 1 }],
      }),
    });

    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error.code, "AUTHORIZATION_ERROR");
    assert.ok(body.error.message.includes("tables.view"));
  });

  test("24. Server-Side Filter: GET /branches/:id/orders filters by date and q search", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders?q=Auto POS Customer`, {
      headers: {
        Authorization: `Bearer ${cashierAToken}`,
      },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.length >= 1);
    assert.ok(body.data.every((o) => o.customer?.name?.includes("Auto POS Customer") || o.customerName?.includes("Auto POS Customer")));
  });

  test("25. LATER Mode Lifecycle: Order created without payment has PENDING status and amountPaid=0", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/pos/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cashierAToken}`,
      },
      body: JSON.stringify({
        type: "PICKUP",
        customerName: "Later Customer",
        customerPhone: "+201044332211",
        items: [{ productId: productA1.id, quantity: 1 }],
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.data.paymentStatus, "PENDING");
    assert.equal(Number(body.data.amountPaid), 0.0);

    const payments = await prisma.orderPayment.findMany({
      where: { restaurantId: tenantA.id, orderId: body.data.id },
    });
    assert.equal(payments.length, 0);
  });
});
