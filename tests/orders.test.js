import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import bcrypt from "bcrypt";
import app from "../src/app/app.js";
import prisma from "../src/lib/prisma.js";
import { authService } from "../src/modules/auth/auth.service.js";
import { disconnectRedis } from "../src/config/redis.js";

describe("Order Management & KDS Module Integration Tests", () => {
  let server;
  let baseUrl;

  let tenantA;
  let branchA;
  let tableA;
  let ownerAToken;
  let staffAToken; // Employee without order management permissions
  let updateOnlyStaffToken; // Employee with orders.view & orders.update ONLY (no orders.cancel)

  let tenantB;
  let branchB;
  let ownerBToken;

  let categoryA;
  let productA1;
  let productA2;
  let modifierA1;

  let createdOrder;
  let publicQrOrder;

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
      name: "Owner Order A",
      email: `ownerordera-${Date.now()}@test.com`,
      password: "Password123!",
      restaurantName: "Order Rest A",
      restaurantSlug: `order-rest-a-${Date.now()}`,
    });
    tenantA = regA.restaurant;

    branchA = await prisma.branch.findFirst({
      where: { restaurantId: tenantA.id, isMain: true },
    });

    const loginA = await authService.login({
      email: regA.employee.email,
      password: "Password123!",
      device: "Test-Runner-OrderA",
      ipAddress: "127.0.0.1",
    });
    ownerAToken = loginA.accessToken;

    // Create a table for Branch A
    tableA = await prisma.restaurantTable.create({
      data: {
        restaurantId: tenantA.id,
        branchId: branchA.id,
        label: "T-10",
        capacity: 4,
        qrToken: `qr-order-test-${Date.now()}`,
      },
    });

    // Create Category & Products for Tenant A
    categoryA = await prisma.category.create({
      data: {
        restaurantId: tenantA.id,
        name: "Burgers",
      },
    });

    productA1 = await prisma.product.create({
      data: {
        restaurantId: tenantA.id,
        categoryId: categoryA.id,
        name: "Classic Burger",
        price: 15.0,
      },
    });

    productA2 = await prisma.product.create({
      data: {
        restaurantId: tenantA.id,
        categoryId: categoryA.id,
        name: "Fries",
        price: 5.0,
      },
    });

    modifierA1 = await prisma.productModifier.create({
      data: {
        restaurantId: tenantA.id,
        productId: productA1.id,
        name: "Extra Cheese",
        priceDelta: 2.5,
      },
    });

    const passwordHash = await bcrypt.hash("Password123!", 10);

    // Create staff role without orders permissions for Tenant A
    const noOrdersRole = await prisma.role.create({
      data: {
        restaurantId: tenantA.id,
        name: "No Orders Staff",
        description: "Staff without orders permission",
      },
    });

    const staffEmp = await prisma.employee.create({
      data: {
        restaurantId: tenantA.id,
        branchId: branchA.id,
        roleId: noOrdersRole.id,
        name: "Staff No Orders",
        email: `staffnoorders-${Date.now()}@test.com`,
        passwordHash,
      },
    });

    const staffLogin = await authService.login({
      email: staffEmp.email,
      password: "Password123!",
      device: "Test-Runner-StaffNoOrders",
      ipAddress: "127.0.0.1",
    });
    staffAToken = staffLogin.accessToken;

    // Create staff role with orders.view & orders.update ONLY (NO orders.cancel)
    const viewUpdatePermissions = await prisma.permission.findMany({
      where: { key: { in: ["orders.view", "orders.update"] } },
    });

    const updateOnlyRole = await prisma.role.create({
      data: {
        restaurantId: tenantA.id,
        name: "Kitchen Update Only Role",
        description: "Kitchen staff with view and update orders permission only",
        permissions: {
          create: viewUpdatePermissions.map((p) => ({
            restaurantId: tenantA.id,
            permissionId: p.id,
          })),
        },
      },
    });

    const updateOnlyEmp = await prisma.employee.create({
      data: {
        restaurantId: tenantA.id,
        branchId: branchA.id,
        roleId: updateOnlyRole.id,
        name: "Kitchen Staff Update Only",
        email: `kitchenupdateonly-${Date.now()}@test.com`,
        passwordHash,
      },
    });

    const updateOnlyLogin = await authService.login({
      email: updateOnlyEmp.email,
      password: "Password123!",
      device: "Test-Runner-UpdateOnlyStaff",
      ipAddress: "127.0.0.1",
    });
    updateOnlyStaffToken = updateOnlyLogin.accessToken;

    // Setup Tenant B
    const regB = await authService.register({
      name: "Owner Order B",
      email: `ownerorderb-${Date.now()}@test.com`,
      password: "Password123!",
      restaurantName: "Order Rest B",
      restaurantSlug: `order-rest-b-${Date.now()}`,
    });
    tenantB = regB.restaurant;

    branchB = await prisma.branch.findFirst({
      where: { restaurantId: tenantB.id, isMain: true },
    });

    const loginB = await authService.login({
      email: regB.employee.email,
      password: "Password123!",
      device: "Test-Runner-OrderB",
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
      await prisma.restaurantTable.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.productModifier.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.product.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.category.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.session.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.employeeBranchAccess.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.employee.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.rolePermission.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.role.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.customerAddress.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.customer.deleteMany({ where: { restaurantId: { in: ids } } });
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

  test("1. POST /api/v1/branches/:branchId/orders creates order with snapshots and calculated subtotals", async () => {
    const idempotencyKey = `idem-key-${Date.now()}`;

    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        type: "DINE_IN",
        source: "CASHIER",
        tableId: tableA.id,
        items: [
          {
            productId: productA1.id,
            quantity: 2, // (15 + 2.5) * 2 = 35.00
            modifierIds: [modifierA1.id],
          },
          {
            productId: productA2.id,
            quantity: 1, // 5.00 * 1 = 5.00
          },
        ],
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.ok(body.data.id);
    assert.equal(body.data.status, "PENDING");
    assert.equal(Number(body.data.subtotal), 40.0);
    assert.equal(Number(body.data.total), 40.0);
    assert.equal(body.data.version, 1);
    assert.equal(body.data.items.length, 2);

    createdOrder = body.data;
  });

  test("2. Idempotency Key Engine: Duplicate request with same Idempotency-Key returns cached response without duplicate creation", async () => {
    const testKey = `idem-dup-test-${Date.now()}`;
    // Fresh table so this order is independent of the active order on tableA (single-order-per-table rule)
    const freshTable = await prisma.restaurantTable.create({
      data: {
        restaurantId: tenantA.id,
        branchId: branchA.id,
        label: `T-idem-${Date.now()}`,
        qrToken: `qr-idem-${Date.now()}`,
      },
    });

    const res1 = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
        "Idempotency-Key": testKey,
      },
      body: JSON.stringify({
        type: "DINE_IN",
        source: "CASHIER",
        tableId: freshTable.id,
        items: [{ productId: productA2.id, quantity: 1 }],
      }),
    });

    assert.equal(res1.status, 201);
    const body1 = await res1.json();

    // Send duplicate request with exact same Idempotency-Key header
    const res2 = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
        "Idempotency-Key": testKey,
      },
      body: JSON.stringify({
        type: "DINE_IN",
        source: "CASHIER",
        tableId: freshTable.id,
        items: [{ productId: productA2.id, quantity: 1 }],
      }),
    });

    assert.equal(res2.status, 201);
    const body2 = await res2.json();

    assert.equal(body2.success, true);
    assert.equal(body2.data.id, body1.data.id); // Same order returned!
  });

  test("3. GET /api/v1/branches/:branchId/orders lists branch orders", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders`, {
      headers: {
        Authorization: `Bearer ${ownerAToken}`,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.pagination.total >= 1);
  });

  test("4. PATCH /api/v1/branches/:branchId/orders/:id/status updates status PENDING -> CONFIRMED", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${createdOrder.id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        newStatus: "CONFIRMED",
        expectedVersion: createdOrder.version,
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.equal(body.data.status, "CONFIRMED");
    assert.equal(body.data.version, 2);
    createdOrder = body.data;
  });

  test("5. Optimistic Locking: Attempting update with stale expectedVersion returns 409 ConflictError", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${createdOrder.id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        newStatus: "PREPARING",
        expectedVersion: 1, // Stale version! (Current version is 2)
      }),
    });

    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error.code, "CONFLICT_ERROR");
  });

  test("6. Invalid State Transition: Attempting CONFIRMED -> DELIVERED returns 422 BusinessRuleError", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${createdOrder.id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        newStatus: "DELIVERED",
        expectedVersion: createdOrder.version,
      }),
    });

    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.error.code, "BUSINESS_RULE_ERROR");
  });

  test("7. Security Hole Protection: Attempting to cancel an order via PATCH /status with newStatus: CANCELLED returns 422 BusinessRuleError", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${createdOrder.id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        newStatus: "CANCELLED",
        expectedVersion: createdOrder.version,
      }),
    });

    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.error.code, "BUSINESS_RULE_ERROR");
    assert.ok(body.error.message.includes("Cancellation is not allowed via status update endpoint"));
  });

  test("8. Security Hole Protection: Staff with orders.update ONLY (no orders.cancel) cannot cancel order via POST /cancel (returns 403 AuthorizationError)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${createdOrder.id}/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${updateOnlyStaffToken}`, // Staff without orders.cancel
      },
      body: JSON.stringify({
        expectedVersion: createdOrder.version,
        reason: "Unauthorized cancellation attempt",
      }),
    });

    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error.code, "AUTHORIZATION_ERROR");
  });

  test("9. State Machine Sequence: CONFIRMED -> PREPARING -> READY -> DELIVERED (Dine-in shortcut)", async () => {
    // 1. CONFIRMED -> PREPARING
    let res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${createdOrder.id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        newStatus: "PREPARING",
        expectedVersion: createdOrder.version,
      }),
    });

    assert.equal(res.status, 200);
    let body = await res.json();
    assert.equal(body.data.status, "PREPARING");
    createdOrder = body.data;

    // 2. PREPARING -> READY
    res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${createdOrder.id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        newStatus: "READY",
        expectedVersion: createdOrder.version,
      }),
    });

    assert.equal(res.status, 200);
    body = await res.json();
    assert.equal(body.data.status, "READY");
    createdOrder = body.data;

    // 3. READY -> DELIVERED (Dine-in shortcut!)
    res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${createdOrder.id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        newStatus: "DELIVERED",
        expectedVersion: createdOrder.version,
      }),
    });

    assert.equal(res.status, 200);
    body = await res.json();
    assert.equal(body.data.status, "DELIVERED");
    createdOrder = body.data;
  });

  test("10. GET /api/v1/branches/:branchId/orders/:id/history returns order timeline history", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${createdOrder.id}/history`, {
      headers: {
        Authorization: `Bearer ${ownerAToken}`,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.equal(body.data.length, 5); // Initial PENDING + 4 transitions
  });

  test("11. POST /api/v1/orders/public submits public order via QR table token", async () => {
    const res = await fetch(`${baseUrl}/api/v1/orders/public`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tableToken: tableA.qrToken,
        items: [
          {
            productId: productA2.id,
            quantity: 2,
          },
        ],
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.equal(body.data.status, "PENDING");
    assert.equal(body.data.source, "QR");
    assert.equal(body.data.tableId, tableA.id);
    publicQrOrder = body.data;
  });

  test("12. POST /api/v1/branches/:branchId/orders/:id/cancel cancels active order (Owner with orders.cancel permission)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${publicQrOrder.id}/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        expectedVersion: publicQrOrder.version,
        reason: "Customer changed mind",
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.equal(body.data.status, "CANCELLED");
    assert.equal(body.data.cancelReason, "Customer changed mind");
  });

  test("13. Cross-Tenant Protection: Tenant B cannot access Tenant A's order (404 Not Found)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders/${createdOrder.id}`, {
      headers: {
        Authorization: `Bearer ${ownerBToken}`, // Token B
      },
    });

    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  test("14. RBAC: Employee without order permissions gets 403 AuthorizationError", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders`, {
      headers: {
        Authorization: `Bearer ${staffAToken}`, // Staff without order permissions
      },
    });

    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error.code, "AUTHORIZATION_ERROR");
  });

  test("15. customerId Validation: Creating order with non-existent customerId returns 404 NotFoundError", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        type: "DINE_IN",
        source: "CASHIER",
        customerId: "non_existent_cust_id_9999",
        tableId: tableA.id,
        items: [{ productId: productA1.id, quantity: 1 }],
      }),
    });

    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error.code, "NOT_FOUND");
    assert.ok(body.error.message.includes("Customer not found or access denied"));
  });

  test("16. customerId Tenant Isolation: Creating order in Tenant A with Tenant B customerId returns 404 NotFoundError", async () => {
    // Create customer in Tenant B
    const custB = await prisma.customer.create({
      data: {
        restaurantId: tenantB.id,
        name: "Tenant B Customer Isolation Test",
        phone: "+201099991111",
      },
    });

    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        type: "DINE_IN",
        source: "CASHIER",
        customerId: custB.id, // Belongs to Tenant B!
        tableId: tableA.id,
        items: [{ productId: productA1.id, quantity: 1 }],
      }),
    });

    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error.code, "NOT_FOUND");
  });

  test("17. Valid customerId & customerPhone Auto-Link: Creating order with valid customerId or customerPhone links customer correctly (201 Created)", async () => {
    // Create customer in Tenant A
    const custA = await prisma.customer.create({
      data: {
        restaurantId: tenantA.id,
        name: "Tenant A Valid Customer",
        phone: "+201088882222",
      },
    });

    // Fresh tables so both sub-orders are independent (single-order-per-table rule)
    const tableForId = await prisma.restaurantTable.create({
      data: { restaurantId: tenantA.id, branchId: branchA.id, label: `T-custid-${Date.now()}`, qrToken: `qr-custid-${Date.now()}` },
    });
    const tableForPhone = await prisma.restaurantTable.create({
      data: { restaurantId: tenantA.id, branchId: branchA.id, label: `T-custph-${Date.now()}`, qrToken: `qr-custph-${Date.now()}` },
    });

    // Sub-test A: Explicit customerId
    const resId = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        type: "DINE_IN",
        source: "CASHIER",
        customerId: custA.id,
        tableId: tableForId.id,
        items: [{ productId: productA1.id, quantity: 1 }],
      }),
    });

    assert.equal(resId.status, 201);
    const bodyId = await resId.json();
    assert.equal(bodyId.data.customerId, custA.id);

    // Sub-test B: customerPhone auto-link
    const resPhone = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        type: "DINE_IN",
        source: "CASHIER",
        customerPhone: "+201088882222", // Existing customer phone!
        tableId: tableForPhone.id,
        items: [{ productId: productA1.id, quantity: 1 }],
      }),
    });

    assert.equal(resPhone.status, 201);
    const bodyPhone = await resPhone.json();
    assert.equal(bodyPhone.data.customerId, custA.id);
  });
});
