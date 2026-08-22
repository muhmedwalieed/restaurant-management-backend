import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import bcrypt from "bcrypt";
import app from "../src/app/app.js";
import prisma from "../src/lib/prisma.js";
import { authService } from "../src/modules/auth/auth.service.js";
import { seedPermissions } from "../prisma/seed.js";
import { disconnectRedis } from "../src/config/redis.js";

describe("Module 15 — Dashboard & Analytics Integration Tests", () => {
  let server;
  let baseUrl;
  let tenantA;
  let branchA;
  let ownerAToken;
  let employeeAId;
  let viewerToken;
  let noDashToken;
  let tenantB;
  let branchB;
  let ownerBToken;
  let productA;
  let productB;

  const daysAgo = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d;
  };

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

    // ===== Tenant A =====
    const regA = await authService.register({
      name: "Owner Dash A",
      email: `dasha-${uniq}@test.com`,
      password: "Password123!",
      restaurantName: "Dash Rest A",
      restaurantSlug: `dash-a-${uniq}`,
    });
    tenantA = regA.restaurant;
    branchA = await prisma.branch.findFirst({ where: { restaurantId: tenantA.id, isMain: true } });
    employeeAId = regA.employee.id;
    const loginA = await authService.login({ email: regA.employee.email, password: "Password123!", device: "A", ipAddress: "127.0.0.1" });
    ownerAToken = loginA.accessToken;

    // Products for top-products aggregation
    productA = await prisma.product.create({ data: { restaurantId: tenantA.id, categoryId: (await prisma.category.create({ data: { restaurantId: tenantA.id, name: "Cat A" } })).id, name: "Burger", price: 20 } });
    productB = await prisma.product.create({ data: { restaurantId: tenantA.id, categoryId: (await prisma.category.create({ data: { restaurantId: tenantA.id, name: "Cat B" } })).id, name: "Pizza", price: 50 } });

    // Customers + tables
    await prisma.customer.create({ data: { restaurantId: tenantA.id, name: "Dash Customer", phone: "+201000000001" } });
    await prisma.restaurantTable.create({ data: { restaurantId: tenantA.id, branchId: branchA.id, label: "T1", qrToken: `qrt1_${uniq}`, status: "OCCUPIED" } });
    await prisma.restaurantTable.create({ data: { restaurantId: tenantA.id, branchId: branchA.id, label: "T2", qrToken: `qrt2_${uniq}`, status: "AVAILABLE" } });

    // Deterministic order dataset:
    // o1 WHATSAPP DELIVERED PAID 100 (paid by owner)     [today]
    // o2 CASHIER  PENDING   PENDING 50                    [today]
    // o3 PHONE    DELIVERED PAID 30  (paid by owner)     [today]
    // o4 QR       CANCELLED PENDING 200                   [today] (excluded from revenue)
    // o5 WEBSITE  DELIVERED PAID 80  (paid by owner)     [3 days ago]
    // o6 WHATSAPP CONFIRMED PAID 40                       [3 days ago]
    const mkOrder = (orderNumber, data) =>
      prisma.order.create({
        data: {
          orderNumber,
          restaurantId: tenantA.id,
          branchId: branchA.id,
          source: "WHATSAPP",
          type: "DELIVERY",
          status: "PENDING",
          paymentStatus: "PENDING",
          subtotal: 0,
          total: 0,
          ...data,
        },
      });

    const o1 = await mkOrder(1001, { source: "WHATSAPP", type: "DELIVERY", status: "DELIVERED", paymentStatus: "PAID", paidByEmployeeId: employeeAId, subtotal: 100, total: 100 });
    await mkOrder(1002, { source: "CASHIER", type: "DINE_IN", status: "PENDING", paymentStatus: "PENDING", subtotal: 50, total: 50 });
    const o3 = await mkOrder(1003, { source: "PHONE", type: "DELIVERY", status: "DELIVERED", paymentStatus: "PAID", paidByEmployeeId: employeeAId, subtotal: 30, total: 30 });
    await mkOrder(1004, { source: "QR", type: "DINE_IN", status: "CANCELLED", paymentStatus: "PENDING", subtotal: 200, total: 200 });
    await mkOrder(1005, { source: "WEBSITE", type: "PICKUP", status: "DELIVERED", paymentStatus: "PAID", paidByEmployeeId: employeeAId, subtotal: 80, total: 80, createdAt: daysAgo(3) });
    await mkOrder(1006, { source: "WHATSAPP", type: "DELIVERY", status: "CONFIRMED", paymentStatus: "PAID", subtotal: 40, total: 40, createdAt: daysAgo(3) });

    // Order items for top-products (non-cancelled only)
    await prisma.orderItem.create({ data: { restaurantId: tenantA.id, orderId: o1.id, productId: productA.id, productName: "Burger", quantity: 2, unitPrice: 20, subtotal: 40 } });
    await prisma.orderItem.create({ data: { restaurantId: tenantA.id, orderId: o1.id, productId: productB.id, productName: "Pizza", quantity: 1, unitPrice: 50, subtotal: 50 } });
    await prisma.orderItem.create({ data: { restaurantId: tenantA.id, orderId: o3.id, productId: productA.id, productName: "Burger", quantity: 1, unitPrice: 20, subtotal: 20 } });

    // Status history for employee performance
    await prisma.orderStatusHistory.create({ data: { restaurantId: tenantA.id, orderId: o1.id, toStatus: "DELIVERED", changedById: employeeAId, reason: "test" } });
    await prisma.orderStatusHistory.create({ data: { restaurantId: tenantA.id, orderId: o1.id, toStatus: "CONFIRMED", changedById: employeeAId, reason: "test" } });
    await prisma.orderStatusHistory.create({ data: { restaurantId: tenantA.id, orderId: o3.id, toStatus: "PREPARING", changedById: employeeAId, reason: "test" } });

    // ===== RBAC roles/employees for Tenant A =====
    const passwordHash = await bcrypt.hash("Password123!", 10);
    const dashPerm = await prisma.permission.findFirst({ where: { key: "dashboard.view" } });

    const viewerRole = await prisma.role.create({
      data: {
        restaurantId: tenantA.id,
        name: "Dashboard Viewer Role",
        description: "dashboard.view only",
        permissions: { create: [{ restaurantId: tenantA.id, permissionId: dashPerm.id }] },
      },
    });
    const viewerEmp = await prisma.employee.create({
      data: { restaurantId: tenantA.id, branchId: branchA.id, roleId: viewerRole.id, name: "Dash Viewer", email: `dashviewer-${uniq}@test.com`, passwordHash },
    });
    const viewerLogin = await authService.login({ email: viewerEmp.email, password: "Password123!", device: "Viewer", ipAddress: "127.0.0.1" });
    viewerToken = viewerLogin.accessToken;

    const noDashRole = await prisma.role.create({
      data: { restaurantId: tenantA.id, name: "No Dashboard Role", description: "no dashboard permission" },
    });
    const noDashEmp = await prisma.employee.create({
      data: { restaurantId: tenantA.id, branchId: branchA.id, roleId: noDashRole.id, name: "No Dash", email: `nodash-${uniq}@test.com`, passwordHash },
    });
    const noDashLogin = await authService.login({ email: noDashEmp.email, password: "Password123!", device: "NoDash", ipAddress: "127.0.0.1" });
    noDashToken = noDashLogin.accessToken;

    // ===== Tenant B (cross-tenant isolation) =====
    const regB = await authService.register({
      name: "Owner Dash B",
      email: `dashb-${uniq}@test.com`,
      password: "Password123!",
      restaurantName: "Dash Rest B",
      restaurantSlug: `dash-b-${uniq}`,
    });
    tenantB = regB.restaurant;
    branchB = await prisma.branch.findFirst({ where: { restaurantId: tenantB.id, isMain: true } });
    const loginB = await authService.login({ email: regB.employee.email, password: "Password123!", device: "B", ipAddress: "127.0.0.1" });
    ownerBToken = loginB.accessToken;

    await prisma.order.create({
      data: { orderNumber: 5001, restaurantId: tenantB.id, branchId: branchB.id, source: "CASHIER", type: "DINE_IN", status: "DELIVERED", paymentStatus: "PAID", subtotal: 999, total: 999 },
    });
  });

  after(async () => {
    for (const tenant of [tenantA, tenantB]) {
      if (!tenant) continue;
      const id = tenant.id;
      await prisma.orderStatusHistory.deleteMany({ where: { restaurantId: id } });
      await prisma.orderItem.deleteMany({ where: { restaurantId: id } });
      await prisma.order.deleteMany({ where: { restaurantId: id } });
      await prisma.customerAddress.deleteMany({ where: { restaurantId: id } });
      await prisma.customer.deleteMany({ where: { restaurantId: id } });
      await prisma.restaurantTable.deleteMany({ where: { restaurantId: id } });
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

  test("1. GET /v1/dashboard/summary returns KPIs that match the real DB", async () => {
    const res = await fetch(`${baseUrl}/api/v1/dashboard/summary`, {
      headers: { Authorization: `Bearer ${ownerAToken}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    const data = body.data;

    assert.equal(data.totalOrders, 6);
    assert.equal(data.activeOrders, 2); // PENDING(1) + CONFIRMED(1)
    assert.equal(data.revenue, 300); // 100+50+30+80+40 (cancelled excluded)
    assert.equal(data.paidRevenue, 250); // 100+30+80+40
    assert.equal(data.averageOrderValue, 60); // 300 / 5 non-cancelled
    assert.equal(data.ordersToday, 4);
    assert.equal(data.revenueToday, 180); // 100+50+30
    assert.equal(data.totalCustomers, 1);
    assert.equal(data.occupiedTables, 1);
    assert.equal(data.topProducts[0].productName, "Burger");
    assert.equal(data.topProducts[0].quantitySold, 3);
  });

  test("2. GET /v1/dashboard/summary?branchId= filters to that branch (data integrity)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/dashboard/summary?branchId=${branchA.id}`, {
      headers: { Authorization: `Bearer ${ownerAToken}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.totalOrders, 6); // all orders are in branchA
    assert.equal(body.data.revenue, 300);
  });

  test("3. GET /v1/dashboard/channel-stats splits orders + revenue by source (non-cancelled)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/dashboard/channel-stats`, {
      headers: { Authorization: `Bearer ${ownerAToken}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    const map = Object.fromEntries(body.data.map((c) => [c.source, c]));
    assert.equal(map.WHATSAPP.orders, 2);
    assert.equal(map.WHATSAPP.revenue, 140);
    assert.equal(map.CASHIER.orders, 1);
    assert.equal(map.CASHIER.revenue, 50);
    assert.equal(map.PHONE.orders, 1);
    assert.equal(map.PHONE.revenue, 30);
    assert.equal(map.WEBSITE.orders, 1);
    assert.equal(map.WEBSITE.revenue, 80);
    assert.equal(map.QR, undefined); // cancelled QR order excluded
  });

  test("4. GET /v1/dashboard/order-status-stats matches status + payment distribution", async () => {
    const res = await fetch(`${baseUrl}/api/v1/dashboard/order-status-stats`, {
      headers: { Authorization: `Bearer ${ownerAToken}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    const byStatus = Object.fromEntries(body.data.byStatus.map((s) => [s.status, s.orders]));
    const byPayment = Object.fromEntries(body.data.byPayment.map((s) => [s.paymentStatus, s.orders]));
    assert.equal(byStatus.DELIVERED, 3);
    assert.equal(byStatus.PENDING, 1);
    assert.equal(byStatus.CONFIRMED, 1);
    assert.equal(byStatus.CANCELLED, 1);
    assert.equal(byPayment.PAID, 4);
    assert.equal(byPayment.PENDING, 2);
  });

  test("5. GET /v1/dashboard/sales-trend groups orders/revenue by day (default last 7 days)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/dashboard/sales-trend`, {
      headers: { Authorization: `Bearer ${ownerAToken}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.length, 2);
    const [older, today] = body.data;
    assert.equal(older.revenue, 120); // o5 + o6
    assert.equal(older.orders, 2);
    assert.equal(today.revenue, 180); // o1 + o2 + o3
    assert.equal(today.orders, 3);
  });

  test("6. GET /v1/dashboard/employee-performance aggregates payments + actions per employee", async () => {
    const res = await fetch(`${baseUrl}/api/v1/dashboard/employee-performance`, {
      headers: { Authorization: `Bearer ${ownerAToken}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.length, 1);
    const emp = body.data[0];
    assert.equal(emp.employeeId, employeeAId);
    assert.equal(emp.ordersCollected, 3); // o1, o3, o5
    assert.equal(emp.revenueCollected, 210); // 100+30+80
    assert.equal(emp.actionsPerformed, 3);
    assert.equal(emp.distinctOrdersHandled, 2); // o1, o3
  });

  test("7. dashboard.view permission grants access to a non-owner", async () => {
    const res = await fetch(`${baseUrl}/api/v1/dashboard/summary`, {
      headers: { Authorization: `Bearer ${viewerToken}` },
    });
    assert.equal(res.status, 200);
  });

  test("8. RBAC: employee without dashboard.view receives 403", async () => {
    const res = await fetch(`${baseUrl}/api/v1/dashboard/summary`, {
      headers: { Authorization: `Bearer ${noDashToken}` },
    });
    assert.equal(res.status, 403);
  });

  test("9. unauthenticated request receives 401", async () => {
    const res = await fetch(`${baseUrl}/api/v1/dashboard/summary`);
    assert.equal(res.status, 401);
  });

  test("10. cross-tenant isolation: tenant B cannot see tenant A data and gets 404 on tenant A branchId", async () => {
    const bSummary = await fetch(`${baseUrl}/api/v1/dashboard/summary`, {
      headers: { Authorization: `Bearer ${ownerBToken}` },
    });
    const bBody = await bSummary.json();
    assert.equal(bSummary.status, 200);
    assert.equal(bBody.data.totalOrders, 1);
    assert.equal(bBody.data.revenue, 999);

    const idor = await fetch(`${baseUrl}/api/v1/dashboard/summary?branchId=${branchA.id}`, {
      headers: { Authorization: `Bearer ${ownerBToken}` },
    });
    assert.equal(idor.status, 404);
  });

  test("11. invalid date range query -> 400", async () => {
    const res = await fetch(`${baseUrl}/api/v1/dashboard/summary?from=not-a-date`, {
      headers: { Authorization: `Bearer ${ownerAToken}` },
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, "VALIDATION_ERROR");
  });
});