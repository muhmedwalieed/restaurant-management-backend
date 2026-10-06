import prisma from "../src/lib/prisma.js";
import GLOBAL_PERMISSIONS from "../src/modules/permissions/permission.catalog.js";
import { invalidateCacheKeys } from "../src/shared/utils/cache.js";

async function sync() {
  console.log("=== Syncing Permissions & Role Isolation ===");

  // 1. Sync catalog permissions into DB
  for (const p of GLOBAL_PERMISSIONS) {
    const existing = await prisma.permission.findFirst({
      where: { key: p.key },
    });
    if (!existing) {
      await prisma.permission.create({
        data: {
          key: p.key,
          description: p.description || p.descriptionAr,
        },
      });
    } else {
      await prisma.permission.update({
        where: { id: existing.id },
        data: {
          description: p.description || p.descriptionAr,
        },
      });
    }
  }

  // 2. Find prime restaurant
  const restaurant = await prisma.restaurant.findFirst({
    where: { slug: "prime-restaurant" },
  });

  if (!restaurant) {
    console.log("Restaurant prime-restaurant not found!");
    return;
  }

  // 3. Clean up Cashier role in this restaurant - remove callcenter or phone permissions
  const cashierRoles = await prisma.role.findMany({
    where: {
      restaurantId: restaurant.id,
      name: { in: ["Cashier", "cashier", "كاشير"] },
    },
    include: { permissions: { include: { permission: true } } },
  });

  for (const cashierRole of cashierRoles) {
    const forbiddenForCashier = ["callcenter.view", "callcenter.manage", "orders.source_phone", "orders.source_whatsapp", "orders.source_website"];
    const permsToDelete = cashierRole.permissions.filter((rp) =>
      forbiddenForCashier.includes(rp.permission.key)
    );

    for (const rp of permsToDelete) {
      await prisma.rolePermission.deleteMany({
        where: {
          restaurantId: restaurant.id,
          id: rp.id,
        },
      });
    }
    console.log(`Removed ${permsToDelete.length} callcenter/phone permissions from Cashier role (${cashierRole.name}).`);
  }

  // 4. Ensure Call Center role exists with proper isolated permissions
  const callCenterPermKeys = [
    "callcenter.view",
    "callcenter.manage",
    "orders.create",
    "orders.view",
    "orders.payment",
    "orders.refund",
    "orders.cancel",
    "orders.source_phone",
    "orders.source_whatsapp",
    "orders.source_website",
    "customers.view",
    "customers.create",
    "customers.update",
    "menu.view",
  ];

  const dbCallCenterPerms = await prisma.permission.findMany({
    where: { key: { in: callCenterPermKeys } },
  });

  let callCenterRole = await prisma.role.findFirst({
    where: {
      restaurantId: restaurant.id,
      name: "call_center",
    },
  });

  if (!callCenterRole) {
    callCenterRole = await prisma.role.create({
      data: {
        restaurantId: restaurant.id,
        name: "call_center",
        description: "موظف استقبال طلبات التليفون والأونلاين والكول سنتر",
      },
    });
  }

  // Reset Call Center permissions
  await prisma.rolePermission.deleteMany({
    where: {
      restaurantId: restaurant.id,
      roleId: callCenterRole.id,
    },
  });

  for (const perm of dbCallCenterPerms) {
    await prisma.rolePermission.create({
      data: {
        restaurantId: restaurant.id,
        roleId: callCenterRole.id,
        permissionId: perm.id,
      },
    });
  }
  console.log(`Configured ${dbCallCenterPerms.length} permissions for Call Center role.`);

  // 5. Invalidate all Redis permission caches
  const allEmployees = await prisma.employee.findMany({
    where: { restaurantId: restaurant.id },
    select: { id: true },
  });

  const cacheKeys = allEmployees.map((e) => `permissions:${e.id}`);
  if (cacheKeys.length > 0) {
    await invalidateCacheKeys(...cacheKeys);
    console.log(`Invalidated cache for ${cacheKeys.length} employees.`);
  }

  console.log("=== Synchronization Complete ===");
}

sync()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
