import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import bcrypt from "bcrypt";
import app from "../src/app/app.js";
import prisma from "../src/lib/prisma.js";
import { authService } from "../src/modules/auth/auth.service.js";
import { staffLogin } from "./helpers/staff-login.js";
import { disconnectRedis } from "../src/config/redis.js";

describe("Delivery & Waiter Security & Role Hardening Tests", () => {
  let server;
  let baseUrl;
  let tenant;
  let branch;
  let driverRole;
  let cashierRole;
  let driver1, driver1Token;
  let driver2, driver2Token;
  let cashier, cashierToken;
  let product;

  before(async () => {
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, () => {
        baseUrl = `http://localhost:${server.address().port}`;
        resolve();
      });
    });

    const reg = await authService.register({
      name: "Owner Security Test",
      email: `owner-sec-${Date.now()}@test.com`,
      password: "Password123!",
      restaurantName: "Security Test Restaurant",
      restaurantSlug: `sec-test-${Date.now()}`,
    });
    tenant = reg.restaurant;

    branch = await prisma.branch.findFirst({
      where: { restaurantId: tenant.id, isMain: true },
    });

    const category = await prisma.category.create({
      data: { restaurantId: tenant.id, name: "Meals" },
    });

    product = await prisma.product.create({
      data: {
        restaurantId: tenant.id,
        categoryId: category.id,
        name: "Test Meal",
        price: 50.0,
      },
    });

    // Ensure permissions exist
    const deliveryView = await prisma.permission.findUnique({ where: { key: "delivery.view" } });
    const deliveryUpdate = await prisma.permission.findUnique({ where: { key: "delivery.update_status" } });
    const deliverySettle = await prisma.permission.findUnique({ where: { key: "delivery.settle" } });
    const ordersView = await prisma.permission.findUnique({ where: { key: "orders.view" } });
    const ordersUpdate = await prisma.permission.findUnique({ where: { key: "orders.update" } });
    const ordersCreate = await prisma.permission.findUnique({ where: { key: "orders.create" } });
    const cashierSource = await prisma.permission.findUnique({ where: { key: "orders.source_cashier" } });

    // Driver role
    driverRole = await prisma.role.create({
      data: {
        restaurantId: tenant.id,
        name: "Test Driver Role",
        permissions: {
          create: [deliveryView.id, deliveryUpdate.id, ordersView.id].map((id) => ({
            restaurantId: tenant.id,
            permissionId: id,
          })),
        },
      },
    });

    // Cashier role
    cashierRole = await prisma.role.create({
      data: {
        restaurantId: tenant.id,
        name: "Test Cashier Role",
        permissions: {
          create: [deliveryView.id, deliveryUpdate.id, deliverySettle.id, ordersView.id, ordersUpdate.id, ordersCreate.id, cashierSource.id].map((id) => ({
            restaurantId: tenant.id,
            permissionId: id,
          })),
        },
      },
    });

    const passwordHash = await bcrypt.hash("Password123!", 10);

    driver1 = await prisma.employee.create({
      data: {
        restaurantId: tenant.id,
        branchId: branch.id,
        roleId: driverRole.id,
        name: "Driver 1",
        email: `driver1-${Date.now()}@test.com`,
        passwordHash,
      },
    });

    driver2 = await prisma.employee.create({
      data: {
        restaurantId: tenant.id,
        branchId: branch.id,
        roleId: driverRole.id,
        name: "Driver 2",
        email: `driver2-${Date.now()}@test.com`,
        passwordHash,
      },
    });

    cashier = await prisma.employee.create({
      data: {
        restaurantId: tenant.id,
        branchId: branch.id,
        roleId: cashierRole.id,
        name: "Cashier",
        email: `cashier-${Date.now()}@test.com`,
        passwordHash,
      },
    });

    const login1 = await staffLogin({
      email: driver1.email,
      password: "Password123!",
      device: "Driver1-Device",
      ipAddress: "127.0.0.1",
    });
    driver1Token = login1.accessToken;

    const login2 = await staffLogin({
      email: driver2.email,
      password: "Password123!",
      device: "Driver2-Device",
      ipAddress: "127.0.0.1",
    });
    driver2Token = login2.accessToken;

    const loginCashier = await staffLogin({
      email: cashier.email,
      password: "Password123!",
      device: "Cashier-Device",
      ipAddress: "127.0.0.1",
    });
    cashierToken = loginCashier.accessToken;
  });

  after(async () => {
    if (tenant?.id) {
      await prisma.auditLog.deleteMany({ where: { restaurantId: tenant.id } });
      await prisma.orderStatusHistory.deleteMany({ where: { restaurantId: tenant.id } });
      await prisma.orderPayment.deleteMany({ where: { restaurantId: tenant.id } });
      await prisma.orderItem.deleteMany({ where: { restaurantId: tenant.id } });
      await prisma.order.deleteMany({ where: { restaurantId: tenant.id } });
      await prisma.customerAddress.deleteMany({ where: { restaurantId: tenant.id } });
      await prisma.customer.deleteMany({ where: { restaurantId: tenant.id } });
      await prisma.product.deleteMany({ where: { restaurantId: tenant.id } });
      await prisma.category.deleteMany({ where: { restaurantId: tenant.id } });
      await prisma.session.deleteMany({ where: { restaurantId: tenant.id } });
      await prisma.employeeBranchAccess.deleteMany({ where: { restaurantId: tenant.id } });
      await prisma.employee.deleteMany({ where: { restaurantId: tenant.id } });
      await prisma.rolePermission.deleteMany({ where: { restaurantId: tenant.id } });
      await prisma.role.deleteMany({ where: { restaurantId: tenant.id } });
      await prisma.branch.deleteMany({ where: { restaurantId: tenant.id } });
      await prisma.restaurant.deleteMany({ where: { id: tenant.id } });
    }

    await new Promise((resolve) => {
      server.closeAllConnections?.();
      server.close(resolve);
    });
    await disconnectRedis();
  });

  test("1. IDOR Protection: Driver 1 requesting Driver 2's wallet is forced to Driver 1's own wallet", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branch.id}/delivery/wallet?driverId=${driver2.id}`, {
      headers: {
        Authorization: `Bearer ${driver1Token}`,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    // Even though driver2.id was passed in query, the system enforced driver1.id
    assert.equal(body.data.driverEmployeeId, driver1.id);
  });

  test("2. Authorized Access: Cashier with delivery.settle CAN inspect Driver 2's wallet", async () => {
    const res = await fetch(`${baseUrl}/api/v1/branches/${branch.id}/delivery/wallet?driverId=${driver2.id}`, {
      headers: {
        Authorization: `Bearer ${cashierToken}`,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.driverEmployeeId, driver2.id);
  });

  test("3. Order Hijacking Protection: Driver 2 cannot deliver an order assigned to Driver 1", async () => {
    // Create a delivery order assigned to Driver 1
    const order = await prisma.order.create({
      data: {
        restaurantId: tenant.id,
        branchId: branch.id,
        orderNumber: 101,
        type: "DELIVERY",
        source: "PHONE",
        status: "OUT_FOR_DELIVERY",
        deliveryStatus: "OUT_FOR_DELIVERY",
        driverEmployeeId: driver1.id,
        orderDate: "2026-10-06",
        subtotal: 50.0,
        total: 50.0,
        paymentStatus: "PENDING",
        paymentMethod: "CASH",
        version: 1,
      },
    });

    // Driver 2 attempts to deliver Driver 1's order
    const res = await fetch(`${baseUrl}/api/v1/branches/${branch.id}/delivery/orders/${order.id}/deliver`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${driver2Token}`,
      },
      body: JSON.stringify({
        expectedVersion: 1,
        paymentMethod: "CASH",
      }),
    });

    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.error.code, "BUSINESS_RULE_ERROR");
    assert.ok(body.error.message.includes("هذا الطلب مسند لمندوب توصيل آخر"));
  });

  test("4. Order Hijacking Protection: Driver 2 cannot fail an order assigned to Driver 1", async () => {
    const order = await prisma.order.create({
      data: {
        restaurantId: tenant.id,
        branchId: branch.id,
        orderNumber: 102,
        type: "DELIVERY",
        source: "PHONE",
        status: "OUT_FOR_DELIVERY",
        deliveryStatus: "OUT_FOR_DELIVERY",
        driverEmployeeId: driver1.id,
        orderDate: "2026-10-06",
        subtotal: 50.0,
        total: 50.0,
        paymentStatus: "PENDING",
        paymentMethod: "CASH",
        version: 1,
      },
    });

    const res = await fetch(`${baseUrl}/api/v1/branches/${branch.id}/delivery/orders/${order.id}/fail`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${driver2Token}`,
      },
      body: JSON.stringify({
        expectedVersion: 1,
        reason: "Hijacking fail attempt",
      }),
    });

    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.error.code, "BUSINESS_RULE_ERROR");
    assert.ok(body.error.message.includes("هذا الطلب مسند لمندوب توصيل آخر"));
  });

  test("5. Legitimate Driver Flow: Driver 1 can deliver their own assigned order and credit COD", async () => {
    const order = await prisma.order.create({
      data: {
        restaurantId: tenant.id,
        branchId: branch.id,
        orderNumber: 103,
        type: "DELIVERY",
        source: "PHONE",
        status: "OUT_FOR_DELIVERY",
        deliveryStatus: "OUT_FOR_DELIVERY",
        driverEmployeeId: driver1.id,
        orderDate: "2026-10-06",
        subtotal: 50.0,
        total: 50.0,
        paymentStatus: "PENDING",
        paymentMethod: "CASH",
        version: 1,
      },
    });

    const res = await fetch(`${baseUrl}/api/v1/branches/${branch.id}/delivery/orders/${order.id}/deliver`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${driver1Token}`,
      },
      body: JSON.stringify({
        expectedVersion: 1,
        paymentMethod: "CASH",
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.status, "DELIVERED");
    assert.equal(body.data.isCod, true);

    // Verify wallet updated with COD amount
    const walletRes = await fetch(`${baseUrl}/api/v1/branches/${branch.id}/delivery/wallet`, {
      headers: {
        Authorization: `Bearer ${driver1Token}`,
      },
    });
    const wallet = await walletRes.json();
    assert.equal(wallet.data.totalCollected, 50.0);
    assert.equal(wallet.data.remainingToSettle, 50.0);
  });

  test("6. Call Center Role Isolation: Call Center agent cannot advance/update order status (403 Forbidden)", async () => {
    const callcenterPerm = await prisma.permission.findUnique({ where: { key: "callcenter.view" } });
    const ordersView = await prisma.permission.findUnique({ where: { key: "orders.view" } });
    const ordersCreate = await prisma.permission.findUnique({ where: { key: "orders.create" } });
    const ordersCancel = await prisma.permission.findUnique({ where: { key: "orders.cancel" } });
    const phoneSource = await prisma.permission.findUnique({ where: { key: "orders.source_phone" } });

    const callcenterRole = await prisma.role.create({
      data: {
        restaurantId: tenant.id,
        name: "call_center",
        permissions: {
          create: [callcenterPerm.id, ordersView.id, ordersCreate.id, ordersCancel.id, phoneSource.id].map((id) => ({
            restaurantId: tenant.id,
            permissionId: id,
          })),
        },
      },
    });

    const passwordHash = await bcrypt.hash("Password123!", 10);
    const ccAgent = await prisma.employee.create({
      data: {
        restaurantId: tenant.id,
        branchId: branch.id,
        roleId: callcenterRole.id,
        name: "Sara Call Center",
        email: `sara-${Date.now()}@test.com`,
        phone: "01099999998",
        passwordHash,
        status: "ACTIVE",
        branchAccesses: {
          create: {
            restaurantId: tenant.id,
            branchId: branch.id,
          },
        },
      },
    });

    const ccLogin = await staffLogin({
      email: ccAgent.email,
      password: "Password123!",
      device: "Test-Runner-CC",
      ipAddress: "127.0.0.1",
    });
    const ccToken = ccLogin.accessToken;

    // 1. Create order as Call Center agent (201 Created)
    const createRes = await fetch(`${baseUrl}/api/v1/branches/${branch.id}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ccToken}`,
      },
      body: JSON.stringify({
        type: "DELIVERY",
        source: "PHONE",
        customerName: "Ahmed Ali",
        customerPhone: "01011112233",
        address: "123 Cairo St",
        items: [{ productId: product.id, quantity: 1 }],
      }),
    });

    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    const orderId = created.data.id;

    // 2. Call Center attempts to change order status to PREPARING / READY -> 403 Forbidden
    const statusRes = await fetch(`${baseUrl}/api/v1/branches/${branch.id}/orders/${orderId}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ccToken}`,
      },
      body: JSON.stringify({
        newStatus: "PREPARING",
        expectedVersion: 1,
      }),
    });

    assert.equal(statusRes.status, 403);
    const statusErr = await statusRes.json();
    assert.equal(statusErr.error.code, "AUTHORIZATION_ERROR");

    // 3. Call Center is allowed to cancel the order -> 200 OK
    const cancelRes = await fetch(`${baseUrl}/api/v1/branches/${branch.id}/orders/${orderId}/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ccToken}`,
      },
      body: JSON.stringify({
        expectedVersion: 1,
        reason: "Customer requested cancellation via phone call",
      }),
    });

    assert.equal(cancelRes.status, 200);
    const cancelBody = await cancelRes.json();
    assert.equal(cancelBody.success, true);
    assert.equal(cancelBody.data.status, "CANCELLED");
  });
});
