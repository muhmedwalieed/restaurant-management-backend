import bcrypt from "bcrypt";
import prisma from "../src/lib/prisma.js";

const email = "waiter@restaurant.com";
const password = "Waiter@123456";
const hash = await bcrypt.hash(password, 10);

const restaurant = await prisma.restaurant.findFirst();
if (!restaurant) { console.error("No restaurant found. Seed or create one first."); process.exit(1); }
const branch = await prisma.branch.findFirst({ where: { restaurantId: restaurant.id } });
if (!branch) { console.error("No branch for restaurant", restaurant.id); process.exit(1); }

let role = await prisma.role.findFirst({ where: { restaurantId: restaurant.id, name: "waiter" } });
if (!role) role = await prisma.role.findFirst({ where: { restaurantId: restaurant.id, name: "ويتر" } });
if (!role) {
  console.log("Creating waiter role...");
  role = await prisma.role.create({ data: { restaurantId: restaurant.id, name: "waiter", description: "Waiter / Floor staff", isSystem: false } });
  for (const key of ["tables.view","orders.view","orders.create"]) {
    const perm = await prisma.permission.findUnique({ where: { key } });
    if (perm) await prisma.rolePermission.create({ data: { restaurantId: restaurant.id, roleId: role.id, permissionId: perm.id } });
  }
}
console.log("Using role:", role.name, role.id);

const existing = await prisma.employee.findFirst({ where: { restaurantId: restaurant.id, email } });
if (existing) {
  await prisma.employee.update({ where: { id: existing.id }, data: { passwordHash: hash, roleId: role.id, branchId: branch.id, status: "ACTIVE", deletedAt: null } });
  console.log("Updated existing waiter:", email, "branch:", branch.name);
} else {
  const emp = await prisma.employee.create({ data: { restaurantId: restaurant.id, branchId: branch.id, roleId: role.id, name: "Waiter", email, passwordHash: hash, status: "ACTIVE" } });
  console.log("Created waiter:", emp.email, "id:", emp.id, "branch:", branch.name);
}
console.log("Done. Login: waiter@restaurant.com / Waiter@123456");
await prisma.$disconnect();
