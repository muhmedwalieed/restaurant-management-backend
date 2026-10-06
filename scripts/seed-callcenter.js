import prisma from "../src/lib/prisma.js";
import { hashPassword } from "../src/modules/auth/keychain.js";
import { GLOBAL_PERMISSIONS } from "../src/modules/permissions/permission.catalog.js";

async function main() {
  console.log("=== Seeding Call Center Role & User ===");

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: "prime-restaurant" },
    include: { branches: true },
  });

  if (!restaurant || !restaurant.branches[0]) {
    throw new Error("Restaurant or main branch not found");
  }

  const branch = restaurant.branches[0];

  // 1. Ensure new permissions exist
  const callCenterPerms = [
    { key: "callcenter.view", name: "View Call Center Portal", nameAr: "عرض واستخدام بوابة الكول سنتر واستقبال الطلبات" },
    { key: "callcenter.manage", name: "Manage Phone & Online Orders", nameAr: "إدارة وتسجيل طلبات الهاتف والأونلاين" },
  ];

  for (const p of callCenterPerms) {
    let perm = await prisma.permission.findUnique({ where: { key: p.key } });
    if (!perm) {
      perm = await prisma.permission.create({
        data: {
          key: p.key,
          description: p.name,
        },
      });
      console.log(`Created permission: ${p.key}`);
    }
  }

  // 2. Find or create Call Center Role
  let callCenterRole = await prisma.role.findFirst({
    where: {
      restaurantId: restaurant.id,
      name: { in: ["call_center", "callcenter", "كول سنتر", "موظف كول سنتر", "Call Center"] },
    },
  });

  if (!callCenterRole) {
    callCenterRole = await prisma.role.create({
      data: {
        restaurantId: restaurant.id,
        name: "call_center",
        description: "Call Center & Phone Orders Agent",
        isSystem: false,
      },
    });
    console.log("Created Role: call_center");
  }

  // 3. Assign permissions to Call Center role
  const targetPermKeys = [
    "callcenter.view",
    "callcenter.manage",
    "orders.create",
    "orders.view",
    "orders.payment",
    "orders.refund",
    "orders.cancel",
    "orders.source_phone",
    "orders.source_website",
    "orders.source_whatsapp",
    "customers.view",
    "customers.create",
    "customers.update",
    "menu.view",
  ];

  const dbPerms = await prisma.permission.findMany({
    where: { key: { in: targetPermKeys } },
  });

  for (const perm of dbPerms) {
    const exists = await prisma.rolePermission.findFirst({
      where: {
        restaurantId: restaurant.id,
        roleId: callCenterRole.id,
        permissionId: perm.id,
      },
    });
    if (!exists) {
      await prisma.rolePermission.create({
        data: {
          restaurantId: restaurant.id,
          roleId: callCenterRole.id,
          permissionId: perm.id,
        },
      });
    }
  }

  // Also grant to Owner role
  const ownerRole = await prisma.role.findFirst({
    where: { restaurantId: restaurant.id, name: "Owner" },
  });
  if (ownerRole) {
    for (const perm of dbPerms) {
      const exists = await prisma.rolePermission.findFirst({
        where: {
          restaurantId: restaurant.id,
          roleId: ownerRole.id,
          permissionId: perm.id,
        },
      });
      if (!exists) {
        await prisma.rolePermission.create({
          data: {
            restaurantId: restaurant.id,
            roleId: ownerRole.id,
            permissionId: perm.id,
          },
        });
      }
    }
  }

  // 4. Create or update Call Center User
  const passwordHash = await hashPassword("Password123!");
  let employee = await prisma.employee.findFirst({
    where: {
      restaurantId: restaurant.id,
      email: "callcenter@restaurant.com",
    },
  });

  if (!employee) {
    employee = await prisma.employee.create({
      data: {
        restaurantId: restaurant.id,
        branchId: branch.id,
        roleId: callCenterRole.id,
        name: "سارة كول سنتر",
        email: "callcenter@restaurant.com",
        phone: "01099999999",
        passwordHash,
        status: "ACTIVE",
        branchAccesses: {
          create: {
            restaurantId: restaurant.id,
            branchId: branch.id,
          },
        },
      },
    });
    console.log("Created Employee: callcenter@restaurant.com (Password123!)");
  } else {
    await prisma.employee.update({
      where: { id: employee.id },
      data: {
        roleId: callCenterRole.id,
        passwordHash,
        status: "ACTIVE",
      },
    });
    console.log("Updated Employee: callcenter@restaurant.com");
  }

  console.log("=== Seeding Call Center Completed Successfully ===");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
