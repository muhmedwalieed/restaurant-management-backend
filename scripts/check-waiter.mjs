import prisma from "../src/lib/prisma.js";
const _r = await prisma.restaurant.findFirst();
const waiter = await prisma.employee.findFirst({ where: { email: "waiter@restaurant.com", restaurantId: _r.id }, include: { role: { include: { permissions: { include: { permission: true } } } }, branch: true } });
console.log(JSON.stringify({ email: waiter?.email, name: waiter?.name, branch: waiter?.branch?.name, branchId: waiter?.branchId, role: waiter?.role?.name, perms: waiter?.role?.permissions?.map(p=>p.permission.key) }, null, 2));
const tables = await prisma.restaurantTable.findMany({ where: { branchId: waiter.branchId, deletedAt: null } });
console.log("tables count:", tables.length, tables.slice(0,3).map(t=>({id:t.id, label:t.label, status:t.status})));
await prisma.$disconnect();
