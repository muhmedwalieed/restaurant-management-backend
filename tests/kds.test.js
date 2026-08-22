import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import bcrypt from "bcrypt";
import app from "../src/app/app.js";
import prisma from "../src/lib/prisma.js";
import { authService } from "../src/modules/auth/auth.service.js";
import { disconnectRedis } from "../src/config/redis.js";

describe("Kitchen Display System (KDS) Integration Tests", () => {
  let server;
  let baseUrl;

  let tenantA;
  let branchA;
  let tableA;
  let ownerAToken;
  let staffAToken; // Employee without orders permissions

  let tenantB;
  let branchB;
  let ownerBToken;

  let categoryA;
  let productA;

  let confirmedOrder;
  let preparingOrder;
  let readyOrder;
  let deliveredOrder;
  let cancelledOrder;

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
      name: "Owner KDS A",
      email: `ownerkdsa-${Date.now()}@test.com`,
      password: "Password123!",
      restaurantName: "KDS Rest A",
      restaurantSlug: `kds-rest-a-${Date.now()}`,
    });
    tenantA = regA.restaurant;

    branchA = await prisma.branch.findFirst({
      where: { restaurantId: tenantA.id, isMain: true },
    });

    const loginA = await authService.login({
      email: regA.employee.email,
      password: "Password123!",
      device: "Test-Runner-KDSA",
      ipAddress: "127.0.0.1",
    });
    ownerAToken = loginA.accessToken;

    tableA = await prisma.restaurantTable.create({
      data: {
        restaurantId: tenantA.id,
        branchId: branchA.id,
        label: "KDS-Table-1",
        capacity: 4,
        qrToken: `kds-qr-test-${Date.now()}`,
      },
    });

    categoryA = await prisma.category.create({
      data: {
        restaurantId: tenantA.id,
        name: "Kitchen Special",
      },
    });

    productA = await prisma.product.create({
      data: {
        restaurantId: tenantA.id,
        categoryId: categoryA.id,
        name: "Kitchen Burger",
        price: 20.0,
      },
    });

    // Create staff role without orders permissions for Tenant A
    const noOrdersRole = await prisma.role.create({
      data: {
        restaurantId: tenantA.id,
        name: "No Orders KDS Staff",
        description: "Staff without orders permission",
      },
    });

    const passwordHash = await bcrypt.hash("Password123!", 10);
    const staffEmp = await prisma.employee.create({
      data: {
        restaurantId: tenantA.id,
        branchId: branchA.id,
        roleId: noOrdersRole.id,
        name: "Staff No KDS Orders",
        email: `staffnokdsorders-${Date.now()}@test.com`,
        passwordHash,
      },
    });

    const staffLogin = await authService.login({
      email: staffEmp.email,
      password: "Password123!",
      device: "Test-Runner-StaffNoKdsOrders",
      ipAddress: "127.0.0.1",
    });
    staffAToken = staffLogin.accessToken;

    // Setup Tenant B
    const regB = await authService.register({
      name: "Owner KDS B",
      email: `ownerkdsb-${Date.now()}@test.com`,
      password: "Password123!",
      restaurantName: "KDS Rest B",
      restaurantSlug: `kds-rest-b-${Date.now()}`,
    });
    tenantB = regB.restaurant;

    branchB = await prisma.branch.findFirst({
      where: { restaurantId: tenantB.id, isMain: true },
    });

    const loginB = await authService.login({
      email: regB.employee.email,
      password: "Password123!",
      device: "Test-Runner-KDSB",
      ipAddress: "127.0.0.1",
    });
    ownerBToken = loginB.accessToken;

    // Create Orders in various statuses for Tenant A
    // 1. CONFIRMED order
    confirmedOrder = await prisma.order.create({
      data: {
        orderNumber: 101,
        restaurantId: tenantA.id,
        branchId: branchA.id,
        tableId: tableA.id,
        status: "CONFIRMED",
        subtotal: 20.0,
        total: 20.0,
        version: 1,
        createdAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
        items: {
          create: [
            {
              restaurantId: tenantA.id,
              productId: productA.id,
              productName: productA.name,
              quantity: 1,
              unitPrice: 20.0,
              subtotal: 20.0,
            },
          ],
        },
      },
    });

    // 2. PREPARING order
    preparingOrder = await prisma.order.create({
      data: {
        orderNumber: 102,
        restaurantId: tenantA.id,
        branchId: branchA.id,
        tableId: tableA.id,
        status: "PREPARING",
        subtotal: 40.0,
        total: 40.0,
        version: 2,
        createdAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
        items: {
          create: [
            {
              restaurantId: tenantA.id,
              productId: productA.id,
              productName: productA.name,
              quantity: 2,
              unitPrice: 20.0,
              subtotal: 40.0,
            },
          ],
        },
      },
    });

    // 3. READY order (Should be excluded from active queue)
    readyOrder = await prisma.order.create({
      data: {
        orderNumber: 103,
        restaurantId: tenantA.id,
        branchId: branchA.id,
        status: "READY",
        subtotal: 20.0,
        total: 20.0,
        version: 3,
      },
    });

    // 4. DELIVERED order (Should be excluded)
    deliveredOrder = await prisma.order.create({
      data: {
        orderNumber: 104,
        restaurantId: tenantA.id,
        branchId: branchA.id,
        status: "DELIVERED",
        subtotal: 20.0,
        total: 20.0,
        version: 4,
      },
    });

    // 5. CANCELLED order (Should be excluded)
    cancelledOrder = await prisma.order.create({
      data: {
        orderNumber: 105,
        restaurantId: tenantA.id,
        branchId: branchA.id,
        status: "CANCELLED",
        subtotal: 20.0,
        total: 20.0,
        version: 1,
      },
    });
  });

  after(async () => {
    const ids = [tenantA?.id, tenantB?.id].filter(Boolean);
    if (ids.length > 0) {
      await prisma.orderStatusHistory.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.orderItem.deleteMany({ where: { restaurantId: { in: ids } } });
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

  test("1. GET /api/v1/branches/:branchId/kds/orders lists ONLY active kitchen orders (CONFIRMED & PREPARING) in FIFO order", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/kds/orders`, {
      headers: {
        Authorization: `Bearer ${ownerAToken}`,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.equal(body.data.length, 2); // Only CONFIRMED and PREPARING

    const statuses = body.data.map((o) => o.status);
    assert.ok(statuses.includes("CONFIRMED"));
    assert.ok(statuses.includes("PREPARING"));
    assert.equal(statuses.includes("READY"), false);
    assert.equal(statuses.includes("DELIVERED"), false);
    assert.equal(statuses.includes("CANCELLED"), false);

    // FIFO check (CONFIRMED created 10 mins ago should be first)
    assert.equal(body.data[0].id, confirmedOrder.id);
    assert.equal(body.data[1].id, preparingOrder.id);

    // Server-calculated elapsedMinutes check (~10 minutes)
    assert.ok(body.data[0].elapsedMinutes >= 9);
    assert.equal(body.data[0].tableLabel, "KDS-Table-1");
  });

  test("2. PATCH /api/v1/branches/:branchId/kds/orders/:id/status advances status CONFIRMED -> PREPARING via Order Engine", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/kds/orders/${confirmedOrder.id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        newStatus: "PREPARING",
        expectedVersion: confirmedOrder.version,
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.equal(body.data.status, "PREPARING");
    assert.equal(body.data.version, 2);
    confirmedOrder = body.data;
  });

  test("3. PATCH /api/v1/branches/:branchId/kds/orders/:id/status advances status PREPARING -> READY and removes it from active queue", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/kds/orders/${confirmedOrder.id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        newStatus: "READY",
        expectedVersion: confirmedOrder.version,
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.status, "READY");

    // Re-query KDS active queue — confirmedOrder should no longer appear
    const listRes = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/kds/orders`, {
      headers: {
        Authorization: `Bearer ${ownerAToken}`,
      },
    });

    const listBody = await listRes.json();
    const ids = listBody.data.map((o) => o.id);
    assert.equal(ids.includes(confirmedOrder.id), false);
  });

  test("4. Invalid Transition: Attempting CONFIRMED -> READY or PREPARING -> PENDING returns 422 BusinessRuleError", async () => {
    // Attempt PREPARING -> PENDING (backward transition)
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/kds/orders/${preparingOrder.id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        newStatus: "PENDING",
        expectedVersion: preparingOrder.version,
      }),
    });

    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.error.code, "BUSINESS_RULE_ERROR");
  });

  test("5. Optimistic Locking: Attempting status update with stale expectedVersion returns 409 ConflictError", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/kds/orders/${preparingOrder.id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        newStatus: "READY",
        expectedVersion: 99, // Stale version!
      }),
    });

    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error.code, "CONFLICT_ERROR");
  });

  test("6. Multi-Tenant Protection: Tenant B cannot view Tenant A's KDS orders (404 Not Found)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/kds/orders`, {
      headers: {
        Authorization: `Bearer ${ownerBToken}`, // Token B
      },
    });

    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  test("7. RBAC: Employee without orders.view or orders.update gets 403 AuthorizationError", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branchA.id}/kds/orders`, {
      headers: {
        Authorization: `Bearer ${staffAToken}`, // Staff without order permissions
      },
    });

    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error.code, "AUTHORIZATION_ERROR");
  });
});
