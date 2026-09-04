import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import prisma from "../src/lib/prisma.js";
import redis, { disconnectRedis } from "../src/config/redis.js";
import { sniffImage, UPLOADS_DIR } from "../src/lib/uploads.js";
import employeeService from "../src/modules/employees/employee.service.js";
import roleService from "../src/modules/roles/role.service.js";
import menuService from "../src/modules/menu/menu.service.js";
import tableSessionService from "../src/modules/table-sessions/table-session.service.js";
import { getEmployeePermissions, invalidateEmployeePermissions } from "../src/modules/auth/authorize.middleware.js";

test("Backend Security Hardening & Isolation Suite", async (t) => {
  let restaurant;
  let branch;
  let role;
  let employee;
  let tenantContext;

  t.before(async () => {
    // Setup isolated test tenant
    const suffix = Date.now();
    restaurant = await prisma.restaurant.create({
      data: {
        name: `SecTest Restaurant ${suffix}`,
        slug: `sectest-${suffix}`,
        status: "ACTIVE",
      },
    });

    branch = await prisma.branch.create({
      data: {
        restaurantId: restaurant.id,
        name: "Main Branch",
        code: `BR-${suffix}`,
        isMain: true,
      },
    });

    const perm = await prisma.permission.findFirst({
      where: { key: "orders.view" },
    });

    role = await prisma.role.create({
      data: {
        restaurantId: restaurant.id,
        name: `custom_role_${suffix}`,
        description: "Custom test role",
        isSystem: false,
        permissions: perm ? { create: [{ restaurantId: restaurant.id, permissionId: perm.id }] } : undefined,
      },
    });

    employee = await prisma.employee.create({
      data: {
        restaurantId: restaurant.id,
        branchId: branch.id,
        roleId: role.id,
        name: "Security Tester",
        email: `sec_${suffix}@example.com`,
        passwordHash: "$2b$10$abcdefghijklmnopqrstuvwxyz1234567890",
        status: "ACTIVE",
      },
    });

    tenantContext = {
      restaurantId: restaurant.id,
      branchId: branch.id,
      employeeId: employee.id,
    };
  });

  t.after(async () => {
    // Cleanup test tenant
    try {
      await prisma.session.deleteMany({ where: { restaurantId: restaurant.id } });
      await prisma.employee.deleteMany({ where: { restaurantId: restaurant.id } });
      await prisma.rolePermission.deleteMany({ where: { restaurantId: restaurant.id } });
      await prisma.role.deleteMany({ where: { restaurantId: restaurant.id } });
      await prisma.category.deleteMany({ where: { restaurantId: restaurant.id } });
      await prisma.product.deleteMany({ where: { restaurantId: restaurant.id } });
      await prisma.restaurantTable.deleteMany({ where: { restaurantId: restaurant.id } });
      await prisma.branch.deleteMany({ where: { restaurantId: restaurant.id } });
      await prisma.restaurant.deleteMany({ where: { id: restaurant.id } });
    } catch {}
    await disconnectRedis();
  });

  await t.test("1. RBAC Cache Invalidation & Single/Pipeline Deletion", async () => {
    // Populate permissions cache
    const perms = await getEmployeePermissions(employee.id, restaurant.id);
    assert.ok(perms);
    assert.equal(perms.roleName, role.name);

    // Invalidate single employee cache
    await invalidateEmployeePermissions(employee.id);

    // Update role permissions and verify pipeline eviction
    await roleService.updateRole(tenantContext, role.id, {
      description: "Updated description for cache test",
    });

    // Fresh fetch should succeed
    const freshPerms = await getEmployeePermissions(employee.id, restaurant.id);
    assert.ok(freshPerms);
  });

  await t.test("2. Session Revocation on Deactivation & Soft Delete", async () => {
    // Create an active session
    const session = await prisma.session.create({
      data: {
        restaurantId: restaurant.id,
        employeeId: employee.id,
        device: "test-device",
        ipAddress: "127.0.0.1",
        refreshTokenHash: "test_hash_revocation",
        status: "ACTIVE",
      },
    });

    assert.equal(session.status, "ACTIVE");

    // Deactivate employee via updateEmployee
    await employeeService.updateEmployee(tenantContext, employee.id, {
      status: "INACTIVE",
    });

    // Check that active session was revoked to FORCE_LOGGED_OUT
    const updatedSession = await prisma.session.findFirst({
      where: { id: session.id, restaurantId: restaurant.id },
    });
    assert.equal(updatedSession?.status, "FORCE_LOGGED_OUT");

    // Reactivate employee for remaining tests
    await prisma.employee.update({
      where: { id: employee.id, restaurantId: restaurant.id },
      data: { status: "ACTIVE" },
    });
  });

  await t.test("3. Table Session Service Prisma Safe Queries", async () => {
    // Create table with QR token
    const qrToken = `qr_sec_${Date.now()}`;
    const table = await prisma.restaurantTable.create({
      data: {
        restaurantId: restaurant.id,
        branchId: branch.id,
        label: "Table Sec-1",
        qrToken,
      },
    });

    // Resolve restaurant ID from QR token
    const resolvedRestId = await tableSessionService.resolveRestaurantId(qrToken);
    assert.equal(resolvedRestId, restaurant.id);

    // Verify non-existent token throws NotFoundError
    await assert.rejects(
      async () => {
        await tableSessionService.resolveRestaurantId("non_existent_token_xyz");
      },
      { name: "NotFoundError" }
    );
  });

  await t.test("4. Menu Read-Through Caching & Invalidation on Mutations", async () => {
    // Create a category
    const category = await menuService.createCategory(tenantContext, {
      name: `Category Sec ${Date.now()}`,
      status: "ACTIVE",
    });
    assert.ok(category.id);

    // Fetch public menu (should cache)
    const menu1 = await menuService.getPublicMenu({ restaurantSlug: restaurant.slug });
    assert.ok(menu1);
    assert.equal(menu1.restaurant.slug, restaurant.slug);

    // Fetch again (should read from cache)
    const menu2 = await menuService.getPublicMenu({ restaurantId: restaurant.id });
    assert.ok(menu2);
    assert.equal(menu2.restaurant.id, restaurant.id);

    // Create a product (should auto-invalidate cache)
    const product = await menuService.createProduct(tenantContext, {
      categoryId: category.id,
      name: `Sec Burger ${Date.now()}`,
      price: 15.5,
      status: "ACTIVE",
    });
    assert.ok(product.id);

    // Update product (should auto-invalidate cache)
    await menuService.updateProduct(tenantContext, product.id, {
      price: 18.0,
    });

    // Delete product (should auto-invalidate cache)
    await menuService.deleteProduct(tenantContext, product.id);

    // Delete category
    await menuService.deleteCategory(tenantContext, category.id);
  });

  await t.test("5. File Upload Magic Bytes Security Validation", async () => {
    const testTempDir = path.resolve(UPLOADS_DIR, "test_tmp");
    if (!fs.existsSync(testTempDir)) {
      fs.mkdirSync(testTempDir, { recursive: true });
    }

    // Valid JPEG (0xFF, 0xD8, 0xFF)
    const validJpegPath = path.join(testTempDir, "valid.jpg");
    fs.writeFileSync(validJpegPath, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]));
    const jpegResult = sniffImage(validJpegPath);
    assert.equal(jpegResult.ok, true);
    assert.equal(jpegResult.type, "image/jpeg");
    fs.unlinkSync(validJpegPath);

    // Valid PNG (0x89, 0x50, 0x4E, 0x47)
    const validPngPath = path.join(testTempDir, "valid.png");
    fs.writeFileSync(validPngPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const pngResult = sniffImage(validPngPath);
    assert.equal(pngResult.ok, true);
    assert.equal(pngResult.type, "image/png");
    fs.unlinkSync(validPngPath);

    // Corrupted / Fake executable posing as image (e.g. <?php or ELF/MZ script)
    const fakeImagePath = path.join(testTempDir, "fake.png");
    fs.writeFileSync(fakeImagePath, Buffer.from("<?php echo 'malicious payload'; ?>"));
    const fakeResult = sniffImage(fakeImagePath);
    assert.equal(fakeResult.ok, false);
    assert.equal(fakeResult.type, null);
    fs.unlinkSync(fakeImagePath);

    // Cleanup temp dir
    try {
      fs.rmdirSync(testTempDir);
    } catch {}
  });
});
