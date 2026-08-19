import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import bcrypt from "bcrypt";
import app from "../src/app/app.js";
import prisma from "../src/lib/prisma.js";
import { authService } from "../src/modules/auth/auth.service.js";
import { disconnectRedis } from "../src/config/redis.js";

describe("Menu Module Integration & Security Tests", () => {
  let server;
  let baseUrl;

  let tenantA;
  let ownerAToken;
  let staffAToken; // Employee without menu.manage permission

  let tenantB;
  let ownerBToken;

  let categoryA1;
  let categoryA2;
  let productA1;
  let modifierA1;

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
      name: "Owner Menu A",
      email: `ownermenua-${Date.now()}@test.com`,
      password: "Password123!",
      restaurantName: "Menu Rest A",
      restaurantSlug: `menu-rest-a-${Date.now()}`,
    });
    tenantA = regA.restaurant;

    const loginA = await authService.login({
      email: regA.employee.email,
      password: "Password123!",
      device: "Test-Runner-MenuA",
      ipAddress: "127.0.0.1",
    });
    ownerAToken = loginA.accessToken;

    // Create staff role without menu.manage permission for Tenant A
    const branchA = await prisma.branch.findFirst({ where: { restaurantId: tenantA.id } });
    const noMenuRole = await prisma.role.create({
      data: {
        restaurantId: tenantA.id,
        name: "No Menu Staff",
        description: "Staff without menu management",
      },
    });

    const passwordHash = await bcrypt.hash("Password123!", 10);

    const staffEmp = await prisma.employee.create({
      data: {
        restaurantId: tenantA.id,
        branchId: branchA.id,
        roleId: noMenuRole.id,
        name: "Staff No Menu",
        email: `staffnomenu-${Date.now()}@test.com`,
        passwordHash,
      },
    });

    const staffLogin = await authService.login({
      email: staffEmp.email,
      password: "Password123!",
      device: "Test-Runner-StaffNoMenu",
      ipAddress: "127.0.0.1",
    });
    staffAToken = staffLogin.accessToken;

    // Setup Tenant B
    const regB = await authService.register({
      name: "Owner Menu B",
      email: `ownermenub-${Date.now()}@test.com`,
      password: "Password123!",
      restaurantName: "Menu Rest B",
      restaurantSlug: `menu-rest-b-${Date.now()}`,
    });
    tenantB = regB.restaurant;

    const loginB = await authService.login({
      email: regB.employee.email,
      password: "Password123!",
      device: "Test-Runner-MenuB",
      ipAddress: "127.0.0.1",
    });
    ownerBToken = loginB.accessToken;
  });

  after(async () => {
    const ids = [tenantA?.id, tenantB?.id].filter(Boolean);
    if (ids.length > 0) {
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

  test("1. POST /api/v1/menu/categories creates a new category for Tenant A (201 Created)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/menu/categories`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        name: "Main Courses",
        description: "Delicious entrees and hot meals",
        sortOrder: 1,
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.equal(body.data.name, "Main Courses");
    assert.equal(body.data.sortOrder, 1);
    categoryA1 = body.data;
  });

  test("2. POST /api/v1/menu/categories with duplicate name returns 409 ConflictError", async () => {
    const res = await fetch(`${baseUrl}/api/v1/menu/categories`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        name: "Main Courses", // Duplicate name!
      }),
    });

    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error.code, "CONFLICT_ERROR");
  });

  test("3. GET /api/v1/menu/categories lists tenant categories", async () => {
    // Create second category
    const res2 = await fetch(`${baseUrl}/api/v1/menu/categories`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        name: "Beverages",
        sortOrder: 2,
      }),
    });
    const body2 = await res2.json();
    categoryA2 = body2.data;

    const res = await fetch(`${baseUrl}/api/v1/menu/categories`, {
      headers: {
        Authorization: `Bearer ${ownerAToken}`,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.equal(body.pagination.total, 2);
  });

  test("4. POST /api/v1/menu/products creates a product under Tenant A category (201 Created)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/menu/products`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        categoryId: categoryA1.id,
        name: "Margherita Pizza",
        description: "Classic pizza with tomato and mozzarella",
        price: 15.99,
        isAvailable: true,
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.equal(body.data.name, "Margherita Pizza");
    assert.equal(body.data.categoryId, categoryA1.id);
    productA1 = body.data;
  });

  test("5. Cross-Tenant categoryId: Creating product with Tenant B category returns 404 Not Found", async () => {
    // Tenant B creates a category
    const resCatB = await fetch(`${baseUrl}/api/v1/menu/categories`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerBToken}`,
      },
      body: JSON.stringify({
        name: "Tenant B Desserts",
      }),
    });
    const bodyCatB = await resCatB.json();
    const categoryB = bodyCatB.data;

    // Tenant A attempts to create product referencing Tenant B's category
    const res = await fetch(`${baseUrl}/api/v1/menu/products`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`, // Owner A
      },
      body: JSON.stringify({
        categoryId: categoryB.id, // Category from Tenant B!
        name: "Illegal Cross-Tenant Product",
        price: 10.0,
      }),
    });

    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  test("6. POST /api/v1/menu/products/:id/modifiers creates a product add-on modifier (201 Created)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/menu/products/${productA1.id}/modifiers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        name: "Extra Cheese",
        priceDelta: 2.5,
        isRequired: false,
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.equal(body.data.name, "Extra Cheese");
    assert.equal(body.data.productId, productA1.id);
    modifierA1 = body.data;
  });

  test("7. DELETE /api/v1/menu/categories/:id with active products returns 422 BusinessRuleError", async () => {
    const res = await fetch(`${baseUrl}/api/v1/menu/categories/${categoryA1.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${ownerAToken}`,
      },
    });

    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.error.code, "BUSINESS_RULE_ERROR");
  });

  test("8. DELETE /api/v1/menu/products/:id performs soft delete on product", async () => {
    const res = await fetch(`${baseUrl}/api/v1/menu/products/${productA1.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${ownerAToken}`,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
  });

  test("9. DELETE /api/v1/menu/categories/:id soft deletes empty category after product deletion", async () => {
    const res = await fetch(`${baseUrl}/api/v1/menu/categories/${categoryA1.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${ownerAToken}`,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
  });

  test("10. GET /api/v1/menu/public returns active menu structure for public ordering", async () => {
    const res = await fetch(`${baseUrl}/api/v1/menu/public?slug=${tenantA.slug}`);

    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.ok(body.data.restaurant);
    assert.equal(body.data.restaurant.id, tenantA.id);
    assert.ok(Array.isArray(body.data.categories));
  });

  test("11. Cross-Tenant Protection: Tenant B cannot access Tenant A's product (404 Not Found)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/menu/products/${productA1.id}`, {
      headers: {
        Authorization: `Bearer ${ownerBToken}`, // Token B
      },
    });

    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  test("12. RBAC: Employee without menu.manage permission gets 403 AuthorizationError", async () => {
    const res = await fetch(`${baseUrl}/api/v1/menu/categories`, {
      headers: {
        Authorization: `Bearer ${staffAToken}`, // Staff token without menu.manage
      },
    });

    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error.code, "AUTHORIZATION_ERROR");
  });
});
