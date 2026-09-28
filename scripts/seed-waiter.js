import prisma from "../src/lib/prisma.js";
import { hashPassword } from "../src/modules/auth/keychain.js";

const WAITER_PERMISSIONS = [
  "tables.view",
  "tables.manage",
  "menu.view",
  "orders.view",
  "orders.create",
  "orders.payment",
  "notifications.view",
];

async function seedWaiter() {
  console.log("=== Seeding Waiter Role and User ===");

  // 1. Find the active restaurant
  const restaurant = (await prisma.restaurant.findFirst({
    where: { name: "Prime Restaurant" },
    include: { branches: true },
  })) || (await prisma.restaurant.findFirst({
    include: { branches: true },
  }));

  if (!restaurant) {
    throw new Error("No restaurant found in the database.");
  }

  const branch = restaurant.branches[0];
  if (!branch) {
    throw new Error(`No branch found for restaurant ${restaurant.name}`);
  }

  console.log(`Target Restaurant: ${restaurant.name} (${restaurant.id})`);
  console.log(`Target Branch: ${branch.name} (${branch.id})`);

  // 2. Ensure all needed permissions exist
  const existingPerms = await prisma.permission.findMany({
    where: { key: { in: WAITER_PERMISSIONS } },
  });
  const existingKeys = new Set(existingPerms.map((p) => p.key));

  for (const permKey of WAITER_PERMISSIONS) {
    if (!existingKeys.has(permKey)) {
      const created = await prisma.permission.create({
        data: {
          key: permKey,
          description: `Permission ${permKey}`,
        },
      });
      existingPerms.push(created);
    }
  }

  // 3. Find or create "ويتر" Role
  let waiterRole = await prisma.role.findFirst({
    where: {
      restaurantId: restaurant.id,
      name: "ويتر",
    },
    include: { permissions: true },
  });

  if (!waiterRole) {
    console.log("Creating 'ويتر' role...");
    waiterRole = await prisma.role.create({
      data: {
        restaurantId: restaurant.id,
        name: "ويتر",
        description: "مسؤول خدمة الصالة وأخذ طلبات الطاولات",
        isSystem: false,
      },
      include: { permissions: true },
    });
  }

  // Assign permissions to role and clean up unauthorized ones
  const allowedPermissionIds = new Set(existingPerms.map((p) => p.id));
  await prisma.rolePermission.deleteMany({
    where: {
      restaurantId: restaurant.id,
      roleId: waiterRole.id,
      permissionId: { notIn: Array.from(allowedPermissionIds) },
    },
  });

  const updatedRolePerms = await prisma.rolePermission.findMany({
    where: { restaurantId: restaurant.id, roleId: waiterRole.id },
  });
  const currentAssignedIds = new Set(updatedRolePerms.map((p) => p.permissionId));
  for (const perm of existingPerms) {
    if (!currentAssignedIds.has(perm.id)) {
      await prisma.rolePermission.create({
        data: {
          restaurantId: restaurant.id,
          roleId: waiterRole.id,
          permissionId: perm.id,
        },
      });
    }
  }

  console.log(`Role 'ويتر' ready with clean permissions.`);

  // 4. Create or update Waiter Employee
  const waiterEmail = "waiter@restaurant.com";
  const plainPassword = "Waiter@123456";
  const passwordHash = await hashPassword(plainPassword);

  let waiterEmployee = await prisma.employee.findFirst({
    where: {
      restaurantId: restaurant.id,
      email: waiterEmail,
    },
    include: { branchAccesses: true },
  });

  if (!waiterEmployee) {
    console.log(`Creating employee ${waiterEmail}...`);
    waiterEmployee = await prisma.employee.create({
      data: {
        restaurantId: restaurant.id,
        branchId: branch.id,
        roleId: waiterRole.id,
        name: "ويتر 1",
        email: waiterEmail,
        passwordHash,
        phone: "01012345678",
        status: "ACTIVE",
      },
      include: { branchAccesses: true },
    });

    // Grant branch access
    await prisma.employeeBranchAccess.create({
      data: {
        restaurantId: restaurant.id,
        employeeId: waiterEmployee.id,
        branchId: branch.id,
      },
    });
  } else {
    console.log(`Updating existing employee ${waiterEmail}...`);
    await prisma.employee.updateMany({
      where: {
        id: waiterEmployee.id,
        restaurantId: restaurant.id,
      },
      data: {
        roleId: waiterRole.id,
        branchId: branch.id,
        passwordHash,
        status: "ACTIVE",
      },
    });

    const hasBranchAccess = waiterEmployee.branchAccesses.some((b) => b.branchId === branch.id);
    if (!hasBranchAccess) {
      await prisma.employeeBranchAccess.create({
        data: {
          restaurantId: restaurant.id,
          employeeId: waiterEmployee.id,
          branchId: branch.id,
        },
      });
    }
  }

  console.log("=== Waiter Employee Created / Updated Successfully ===");
  console.log(JSON.stringify({
    id: waiterEmployee.id,
    name: waiterEmployee.name,
    email: waiterEmployee.email,
    password: plainPassword,
    role: "ويتر",
    branch: branch.name,
  }, null, 2));

  await prisma.$disconnect();
}

seedWaiter().catch((err) => {
  console.error("Failed to seed waiter:", err);
  process.exit(1);
});
