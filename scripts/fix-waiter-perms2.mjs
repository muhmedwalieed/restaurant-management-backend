import prisma from "../src/lib/prisma.js";
const r = await prisma.restaurant.findFirst();
const waiter = await prisma.employee.findFirst({ where: { email: "waiter@restaurant.com", restaurantId: r.id }, include: { role: true } });
console.log("Role", waiter.role.name, waiter.roleId);
const needed = ["tables.view","tables.manage","orders.view","orders.create","orders.payment","orders.update","menu.view"];
for (const key of needed) {
  const perm = await prisma.permission.findUnique({ where: { key } });
  if (!perm) { console.log("Missing perm", key); continue; }
  const exists = await prisma.rolePermission.findFirst({ where: { restaurantId: r.id, roleId: waiter.roleId, permissionId: perm.id } });
  if (!exists) {
    await prisma.rolePermission.create({ data: { restaurantId: r.id, roleId: waiter.roleId, permissionId: perm.id } });
    console.log("Added", key);
  } else console.log("Has", key);
}
const all = await prisma.rolePermission.findMany({ where: { restaurantId: r.id, roleId: waiter.roleId }, include:{permission:true} });
console.log("Final perms:", all.map(p=>p.permission.key));
await prisma.$disconnect();
console.log("Done - waiter can now pay + manage tables. Frontend guard still locks to /waiter only.");
