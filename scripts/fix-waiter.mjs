import prisma from "../src/lib/prisma.js";
const restaurant = await prisma.restaurant.findFirst();
const waiter = await prisma.employee.findFirst({ where: { email: "waiter@restaurant.com", restaurantId: restaurant.id }, include: { role: true } });
console.log("Before role:", waiter.role.name, waiter.role.id);

// Ensure waiter role has correct permissions: tables.view, orders.view, orders.create, menu.view
const needed = ["tables.view","orders.view","orders.create","menu.view"];
for (const key of needed) {
  const perm = await prisma.permission.findUnique({ where: { key } });
  if (!perm) { console.log("Missing perm", key); continue; }
  const exists = await prisma.rolePermission.findFirst({ where: { restaurantId: restaurant.id, roleId: waiter.roleId, permissionId: perm.id } });
  if (!exists) {
    await prisma.rolePermission.create({ data: { restaurantId: restaurant.id, roleId: waiter.roleId, permissionId: perm.id } });
    console.log("Added", key);
  } else {
    console.log("Already has", key);
  }
}

// Remove extra perms that would give waiter access to POS/dashboard if any (keep only needed)
const allPerms = await prisma.rolePermission.findMany({ where: { restaurantId: restaurant.id, roleId: waiter.roleId }, include: { permission: true } });
console.log("Current perms:", allPerms.map(p=>p.permission.key));
for (const rp of allPerms) {
  if (!needed.includes(rp.permission.key)) {
    await prisma.rolePermission.delete({ where: { id: rp.id } });
    console.log("Removed extra", rp.permission.key);
  }
}

// Check tables for waiter's branch
const branchId = waiter.branchId;
const tables = await prisma.restaurantTable.findMany({ where: { restaurantId: restaurant.id, branchId, deletedAt: null } });
console.log(`Tables for branch ${branchId}:`, tables.length);
if (tables.length === 0) {
  console.log("Creating 6 demo tables...");
  for (let i=1;i<=6;i++) {
    const t = await prisma.restaurantTable.create({ data: { restaurantId: restaurant.id, branchId, label: `T${i}`, capacity: 4, status: "AVAILABLE", qrToken: `qr-waiter-demo-${Date.now()}-${i}-${Math.random().toString(36).slice(2,6)}` } });
    console.log("Created", t.label, t.id);
  }
}

// Invalidate permission cache if needed (redis)
try {
  const { default: redis } = await import("../src/config/redis.js");
  // just try to delete cache key
  const { createClient } = await import("ioredis");
} catch {}

await prisma.$disconnect();
console.log("Done fix-waiter");
