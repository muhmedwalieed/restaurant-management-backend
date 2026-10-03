import prisma from "../src/lib/prisma.js";

async function main() {
  console.log("=== Seeding Shift Permissions and Role Assignments ===");

  const shiftPerms = [
    { key: "shifts.view", name: "View Shifts & Reports" },
    { key: "shifts.open", name: "Open Shift" },
    { key: "shifts.close", name: "Close Shift (Z-Report)" },
    { key: "shifts.manage_cash", name: "Manage Drawer Cash Movements" },
  ];

  for (const p of shiftPerms) {
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

  // Assign to Owner, Cashier, Admin roles in all restaurants
  const restaurants = await prisma.restaurant.findMany({ select: { id: true, slug: true } });

  for (const rest of restaurants) {
    const roles = await prisma.role.findMany({
      where: {
        restaurantId: rest.id,
        name: { in: ["owner", "Owner", "cashier", "Cashier", "admin", "Admin", "كاشير", "مدير"] },
      },
    });

    for (const role of roles) {
      for (const p of shiftPerms) {
        const permDef = await prisma.permission.findUnique({ where: { key: p.key } });
        const existing = await prisma.rolePermission.findFirst({
          where: {
            restaurantId: rest.id,
            roleId: role.id,
            permissionId: permDef.id,
          },
        });
        if (!existing) {
          await prisma.rolePermission.create({
            data: {
              restaurantId: rest.id,
              roleId: role.id,
              permissionId: permDef.id,
            },
          });
          console.log(`Assigned ${p.key} to role ${role.name} in ${rest.slug}`);
        }
      }
    }
  }

  console.log("=== Shift permissions seeded successfully ===");
}

main()
  .catch((err) => {
    console.error("Failed to seed shifts:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
