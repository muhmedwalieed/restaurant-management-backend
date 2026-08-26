import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import bcrypt from "bcrypt";
import app from "../src/app/app.js";
import prisma from "../src/lib/prisma.js";
import { authService } from "../src/modules/auth/auth.service.js";
import { seedPermissions } from "../prisma/seed.js";
import { disconnectRedis } from "../src/config/redis.js";

describe("Module 16 — Discounts & Coupons Integration Tests", () => {
  let server;
  let baseUrl;
  let tenantA;
  let branchA;
  let ownerToken;
  let noCouponToken;
  let tenantB;
  let ownerBToken;
  let productA;
  let productB;
  let unavailableProduct;
  let save10;
  let fix20;
  let expired;
  let once1;
  let min500;
  let burger10;

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
      name: "Owner Coupon A",
      email: `coupona-${uniq}@test.com`,
      password: "Password123!",
      restaurantName: "Coupon Rest A",
      restaurantSlug: `coupon-a-${uniq}`,
    });
    tenantA = regA.restaurant;
    branchA = await prisma.branch.findFirst({ where: { restaurantId: tenantA.id, isMain: true } });
    const loginA = await authService.login({ email: regA.employee.email, password: "Password123!", device: "A", ipAddress: "127.0.0.1" });
    ownerToken = loginA.accessToken;

    const cat = await prisma.category.create({ data: { restaurantId: tenantA.id, name: "Cat" } });
    productA = await prisma.product.create({ data: { restaurantId: tenantA.id, categoryId: cat.id, name: "Burger", price: 100 } });
    productB = await prisma.product.create({ data: { restaurantId: tenantA.id, categoryId: cat.id, name: "Pizza", price: 50 } });
    unavailableProduct = await prisma.product.create({
      data: { restaurantId: tenantA.id, categoryId: cat.id, name: "Hidden", price: 10, isAvailable: false },
    });

    const passwordHash = await bcrypt.hash("Password123!", 10);
    const noPermRole = await prisma.role.create({
      data: { restaurantId: tenantA.id, name: "No Coupons Role", description: "no coupon permission" },
    });
    const noPermEmp = await prisma.employee.create({
      data: { restaurantId: tenantA.id, branchId: branchA.id, roleId: noPermRole.id, name: "No Coupons", email: `nocoupons-${uniq}@test.com`, passwordHash },
    });
    const noPermLogin = await authService.login({ email: noPermEmp.email, password: "Password123!", device: "NoCoupon", ipAddress: "127.0.0.1" });
    noCouponToken = noPermLogin.accessToken;

    const regB = await authService.register({
      name: "Owner Coupon B",
      email: `couponb-${uniq}@test.com`,
      password: "Password123!",
      restaurantName: "Coupon Rest B",
      restaurantSlug: `coupon-b-${uniq}`,
    });
    tenantB = regB.restaurant;
    const loginB = await authService.login({ email: regB.employee.email, password: "Password123!", device: "B", ipAddress: "127.0.0.1" });
    ownerBToken = loginB.accessToken;

    const past = new Date(Date.now() - 3600_000);
    const future = new Date(Date.now() + 3600_000);
    expired = await prisma.coupon.create({ data: { restaurantId: tenantA.id, code: "EXPIRED", type: "PERCENTAGE", value: 10, expiresAt: past } });
    once1 = await prisma.coupon.create({ data: { restaurantId: tenantA.id, code: "ONCE1", type: "PERCENTAGE", value: 10, usageLimit: 1 } });
    min500 = await prisma.coupon.create({ data: { restaurantId: tenantA.id, code: "MIN500", type: "FIXED", value: 50, minSubtotal: 500 } });
    burger10 = await prisma.coupon.create({
      data: { restaurantId: tenantA.id, code: "BURGER10", type: "PERCENTAGE", value: 10, applicableProductIds: [productA.id], startsAt: past, expiresAt: future },
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
      await prisma.auditLog.deleteMany({ where: { restaurantId: id } });
      await prisma.restaurant.deleteMany({ where: { id } });
    }
    await new Promise((resolve) => {
      server.closeAllConnections?.();
      server.close(resolve);
    });
    await disconnectRedis();
  });

  const createCoupon = (body) =>
    fetch(`${baseUrl}/api/v1/coupons`, { method: "POST", headers: auth(ownerToken), body: JSON.stringify(body) });

  const placeOrder = (body) =>
    fetch(`${baseUrl}/api/v1/branches/${branchA.id}/orders`, { method: "POST", headers: auth(ownerToken), body: JSON.stringify(body) });

  test("1. POST /v1/coupons creates a PERCENTAGE coupon (code uppercased)", async () => {
    const res = await createCoupon({ code: "save10", type: "PERCENTAGE", value: 10 });
    assert.equal(res.status, 201);
    const body = await res.json();
    save10 = body.data;
    assert.equal(body.data.code, "SAVE10");
    assert.equal(body.data.type, "PERCENTAGE");
    assert.equal(Number(body.data.value), 10);
  });

  test("2. POST /v1/coupons creates a FIXED coupon", async () => {
    const res = await createCoupon({ code: "fix20", type: "FIXED", value: 20 });
    assert.equal(res.status, 201);
    const body = await res.json();
    fix20 = body.data;
    assert.equal(body.data.code, "FIX20");
    assert.equal(body.data.type, "FIXED");
  });

  test("3. POST duplicate coupon code -> 409", async () => {
    const res = await createCoupon({ code: "save10", type: "PERCENTAGE", value: 15 });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error.code, "CONFLICT_ERROR");
  });

  test("4. POST percentage value > 100 -> 400", async () => {
    const res = await createCoupon({ code: "TOOBIG", type: "PERCENTAGE", value: 150 });
    assert.equal(res.status, 400);
  });

  test("5. GET /v1/coupons lists coupons with pagination + q filter", async () => {
    const res = await fetch(`${baseUrl}/api/v1/coupons?q=save`, { headers: auth(ownerToken) });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.pagination.total >= 1);
    assert.ok(body.data.some((c) => c.code === "SAVE10"));
  });

  test("6. GET /v1/coupons/:id returns the coupon", async () => {
    const res = await fetch(`${baseUrl}/api/v1/coupons/${save10.id}`, { headers: auth(ownerToken) });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.code, "SAVE10");
  });

  test("7. PATCH partial update does NOT reset unset fields (defaults not applied)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/coupons/${save10.id}`, {
      method: "PATCH",
      headers: auth(ownerToken),
      body: JSON.stringify({ value: 15 }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(Number(body.data.value), 15);
    assert.equal(body.data.type, "PERCENTAGE");
    assert.equal(Number(body.data.minSubtotal), 0);
    assert.equal(body.data.isActive, true);
  });

  test("8. PATCH can clear a nullable field (maxDiscount -> null)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/coupons/${save10.id}`, {
      method: "PATCH",
      headers: auth(ownerToken),
      body: JSON.stringify({ maxDiscount: 5 }),
    });
    assert.equal(res.status, 200);

    const clear = await fetch(`${baseUrl}/api/v1/coupons/${save10.id}`, {
      method: "PATCH",
      headers: auth(ownerToken),
      body: JSON.stringify({ maxDiscount: null }),
    });
    assert.equal(clear.status, 200);
    const body = await clear.json();
    assert.equal(body.data.maxDiscount, null);
  });

  test("9. DELETE soft-deletes the coupon (excluded from list, get -> 404)", async () => {
    const created = await createCoupon({ code: "TMP99", type: "FIXED", value: 5 });
    const id = (await created.json()).data.id;

    const del = await fetch(`${baseUrl}/api/v1/coupons/${id}`, { method: "DELETE", headers: auth(ownerToken) });
    assert.equal(del.status, 200);

    const dbCoupon = await prisma.coupon.findFirst({ where: { id, restaurantId: tenantA.id } });
    assert.ok(dbCoupon.deletedAt);
    assert.equal(dbCoupon.isActive, false);

    const list = await fetch(`${baseUrl}/api/v1/coupons?q=TMP99`, { headers: auth(ownerToken) });
    const listBody = await list.json();
    assert.ok(!listBody.data.some((c) => c.id === id));

    const get = await fetch(`${baseUrl}/api/v1/coupons/${id}`, { headers: auth(ownerToken) });
    assert.equal(get.status, 404);
  });

  test("10. cross-tenant IDOR: tenant B cannot read tenant A coupon -> 404", async () => {
    const res = await fetch(`${baseUrl}/api/v1/coupons/${save10.id}`, { headers: auth(ownerBToken) });
    assert.equal(res.status, 404);
  });

  test("11. same code is allowed in a DIFFERENT restaurant (uniqueness is restaurant-scoped)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/coupons`, {
      method: "POST",
      headers: auth(ownerBToken),
      body: JSON.stringify({ code: "SAVE10", type: "PERCENTAGE", value: 5 }),
    });
    assert.equal(res.status, 201);
  });

  test("12. RBAC: employee without coupons.manage -> 403", async () => {
    const res = await fetch(`${baseUrl}/api/v1/coupons`, { headers: auth(noCouponToken) });
    assert.equal(res.status, 403);
  });

  test("13. unauthenticated -> 401", async () => {
    const res = await fetch(`${baseUrl}/api/v1/coupons`);
    assert.equal(res.status, 401);
  });

  test("14. mass assignment: restaurantId/timesUsed in body are ignored", async () => {
    const res = await createCoupon({
      code: "MASS1",
      type: "FIXED",
      value: 5,
      restaurantId: tenantB.id,
      timesUsed: 999,
      isActive: false,
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.data.restaurantId, tenantA.id);
    assert.equal(body.data.timesUsed, 0);
    assert.equal(body.data.isActive, false);
  });

  test("15. order with coupon: server-side discount + timesUsed incremented", async () => {
    const res = await placeOrder({
      type: "PICKUP",
      couponId: save10.id,
      items: [
        { productId: productA.id, quantity: 2 },
        { productId: productB.id, quantity: 1 },
      ],
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(Number(body.data.subtotal), 250);
    assert.equal(Number(body.data.discountAmount), 37.5);
    assert.equal(Number(body.data.total), 212.5);
    assert.equal(body.data.couponId, save10.id);

    const db = await prisma.coupon.findFirst({ where: { id: save10.id, restaurantId: tenantA.id } });
    assert.equal(db.timesUsed, 1);
  });

  test("16. client-supplied discountAmount is IGNORED when a coupon is attached", async () => {
    const res = await placeOrder({
      type: "PICKUP",
      couponId: save10.id,
      discountAmount: 999,
      items: [{ productId: productA.id, quantity: 1 }],
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(Number(body.data.discountAmount), 15);
    assert.equal(Number(body.data.total), 85);
  });

  test("17. expired coupon rejects the order (422) and does NOT consume usage", async () => {
    const res = await placeOrder({
      type: "PICKUP",
      couponId: expired.id,
      items: [{ productId: productA.id, quantity: 1 }],
    });
    assert.equal(res.status, 422);
    const db = await prisma.coupon.findFirst({ where: { id: expired.id, restaurantId: tenantA.id } });
    assert.equal(db.timesUsed, 0);
  });

  test("18. usage limit reached rejects the second order (422)", async () => {
    const first = await placeOrder({
      type: "PICKUP",
      couponId: once1.id,
      items: [{ productId: productA.id, quantity: 1 }],
    });
    assert.equal(first.status, 201);

    const second = await placeOrder({
      type: "PICKUP",
      couponId: once1.id,
      items: [{ productId: productA.id, quantity: 1 }],
    });
    assert.equal(second.status, 422);
    const body = await second.json();
    assert.equal(body.error.code, "BUSINESS_RULE_ERROR");
  });

  test("19. minSubtotal not met rejects the order (422)", async () => {
    const res = await placeOrder({
      type: "PICKUP",
      couponId: min500.id,
      items: [{ productId: productA.id, quantity: 1 }],
    });
    assert.equal(res.status, 422);
  });

  test("20. product-restricted coupon discounts only eligible items", async () => {
    const res = await placeOrder({
      type: "PICKUP",
      couponId: burger10.id,
      items: [
        { productId: productA.id, quantity: 1 },
        { productId: productB.id, quantity: 1 },
      ],
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(Number(body.data.subtotal), 150);
    assert.equal(Number(body.data.discountAmount), 10);
    assert.equal(Number(body.data.total), 140);
  });

  test("21. product-restricted coupon on ineligible-only order -> 422", async () => {
    const res = await placeOrder({
      type: "PICKUP",
      couponId: burger10.id,
      items: [{ productId: productB.id, quantity: 1 }],
    });
    assert.equal(res.status, 422);
  });

  test("22. public order with couponCode applies the discount", async () => {
    const res = await fetch(`${baseUrl}/api/v1/orders/public`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantId: tenantA.id,
        type: "PICKUP",
        customerName: "Public Customer",
        customerPhone: "+201111111111",
        couponCode: "fix20",
        items: [{ productId: productA.id, quantity: 1 }],
      }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(Number(body.data.discountAmount), 20);
    assert.equal(Number(body.data.total), 80);
  });

  test("23. public order with an invalid couponCode -> 422", async () => {
    const res = await fetch(`${baseUrl}/api/v1/orders/public`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantId: tenantA.id,
        type: "PICKUP",
        customerName: "Public Customer",
        customerPhone: "+201111111112",
        couponCode: "DOESNOTEXIST",
        items: [{ productId: productA.id, quantity: 1 }],
      }),
    });
    assert.equal(res.status, 422);
  });

  test("24. failed order (unavailable product) with coupon does NOT consume usage", async () => {
    const res = await placeOrder({
      type: "PICKUP",
      couponId: once1.id,
      items: [{ productId: unavailableProduct.id, quantity: 1 }],
    });
    assert.equal(res.status, 404);
    const db = await prisma.coupon.findFirst({ where: { id: once1.id, restaurantId: tenantA.id } });
    assert.equal(db.timesUsed, 1);
  });

  test("25. POST /v1/coupons/validate returns the discount WITHOUT incrementing usage", async () => {
    const before = await prisma.coupon.findFirst({ where: { id: save10.id, restaurantId: tenantA.id } });
    const res = await fetch(`${baseUrl}/api/v1/coupons/validate`, {
      method: "POST",
      headers: auth(ownerToken),
      body: JSON.stringify({
        code: "save10",
        subtotal: 250,
        items: [{ productId: productA.id, subtotal: 200 }, { productId: productB.id, subtotal: 50 }],
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.code, "SAVE10");
    assert.equal(body.data.discountAmount, 37.5);

    const after = await prisma.coupon.findFirst({ where: { id: save10.id, restaurantId: tenantA.id } });
    assert.equal(after.timesUsed, before.timesUsed);
  });

  test("26. validate rejects an expired code (422)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/coupons/validate`, {
      method: "POST",
      headers: auth(ownerToken),
      body: JSON.stringify({ code: "EXPIRED", subtotal: 100, items: [{ productId: productA.id, subtotal: 100 }] }),
    });
    assert.equal(res.status, 422);
  });
});
