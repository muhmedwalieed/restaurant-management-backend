import prisma from "../src/lib/prisma.js";
import { hashPassword } from "../src/modules/auth/keychain.js";

async function main() {
  console.log("=== Seeding Kitchen (KDS) Role and Employee ===");

  // 1. Find the Prime Restaurant
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: "prime-restaurant" },
    include: { branches: true },
  });

  if (!restaurant) {
    throw new Error("Prime Restaurant not found!");
  }

  const branch = restaurant.branches[0];
  if (!branch) {
    throw new Error("Main branch not found for Prime Restaurant!");
  }

  // 2. Kitchen Permissions Needed
  const kitchenPermKeys = ["kds.view", "kds.manage", "orders.view"];

  // 3. Find or Create Role 'kitchen' (شيف المطبخ)
  let kitchenRole = await prisma.role.findFirst({
    where: {
      restaurantId: restaurant.id,
      name: { in: ["kitchen", "مطبخ", "Kitchen", "شيف المطبخ"] },
    },
    include: { permissions: true },
  });

  if (!kitchenRole) {
    console.log("Creating Role 'kitchen'...");
    kitchenRole = await prisma.role.create({
      data: {
        restaurantId: restaurant.id,
        name: "kitchen",
        description: "Kitchen Staff & Chefs with KDS Access",
        isSystem: false,
      },
      include: { permissions: true },
    });
  }

  // Assign permissions to the kitchen role
  for (const key of kitchenPermKeys) {
    const existing = await prisma.rolePermission.findFirst({
      where: {
        restaurantId: restaurant.id,
        roleId: kitchenRole.id,
        permission: { key },
      },
    });

    if (!existing) {
      // Find or create permission definition
      let permDef = await prisma.permission.findUnique({
        where: { key },
      });

      if (!permDef) {
        permDef = await prisma.permission.create({
          data: {
            key,
            name: key === "kds.view" ? "View KDS" : key === "kds.manage" ? "Manage KDS" : "View Orders",
            nameAr: key === "kds.view" ? "عرض شاشة المطبخ (KDS)" : key === "kds.manage" ? "إدارة شاشة المطبخ" : "عرض الطلبات",
            module: key.startsWith("kds") ? "kds" : "orders",
          },
        });
      }

      await prisma.rolePermission.create({
        data: {
          restaurantId: restaurant.id,
          roleId: kitchenRole.id,
          permissionId: permDef.id,
        },
      });
      console.log(`Granted permission '${key}' to kitchen role.`);
    }
  }

  // 4. Create or Update Kitchen Employee
  const kitchenEmail = "kitchen@restaurant.com";
  const plainPassword = "Password123!";
  const passwordHash = await hashPassword(plainPassword);

  let kitchenEmployee = await prisma.employee.findFirst({
    where: {
      restaurantId: restaurant.id,
      email: kitchenEmail,
    },
    include: { branchAccesses: true },
  });

  if (!kitchenEmployee) {
    console.log(`Creating employee ${kitchenEmail}...`);
    kitchenEmployee = await prisma.employee.create({
      data: {
        restaurantId: restaurant.id,
        branchId: branch.id,
        roleId: kitchenRole.id,
        name: "شيف المطبخ",
        email: kitchenEmail,
        passwordHash,
        phone: "01099887766",
        status: "ACTIVE",
      },
      include: { branchAccesses: true },
    });

    await prisma.employeeBranchAccess.create({
      data: {
        restaurantId: restaurant.id,
        employeeId: kitchenEmployee.id,
        branchId: branch.id,
      },
    });
  } else {
    console.log(`Updating existing employee ${kitchenEmail}...`);
    await prisma.employee.updateMany({
      where: {
        id: kitchenEmployee.id,
        restaurantId: restaurant.id,
      },
      data: {
        roleId: kitchenRole.id,
        branchId: branch.id,
        passwordHash,
        status: "ACTIVE",
      },
    });

    const hasBranchAccess = kitchenEmployee.branchAccesses.some((b) => b.branchId === branch.id);
    if (!hasBranchAccess) {
      await prisma.employeeBranchAccess.create({
        data: {
          restaurantId: restaurant.id,
          employeeId: kitchenEmployee.id,
          branchId: branch.id,
        },
      });
    }
  }

  console.log("=== Kitchen Employee Created / Updated Successfully ===");
  console.log(JSON.stringify({
    restaurant: restaurant.name,
    email: kitchenEmployee.email,
    password: plainPassword,
    name: kitchenEmployee.name,
    role: "kitchen",
    permissions: kitchenPermKeys,
    targetUrl: "http://prime-restaurant.localhost:5173/kds",
  }, null, 2));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Error seeding kitchen employee:", e);
  await prisma.$disconnect();
  process.exit(1);
});
