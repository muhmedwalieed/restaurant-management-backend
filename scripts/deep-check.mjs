import prisma from "../src/lib/prisma.js";
const r = await prisma.restaurant.findFirst();
const branch = await prisma.branch.findFirst({ where: { restaurantId: r.id } });
console.log("=== TABLES ===");
const tables = await prisma.restaurantTable.findMany({ where: { restaurantId: r.id, branchId: branch.id, deletedAt: null }, orderBy:{label:"asc"} });
for (const t of tables) console.log(` ${t.label} id=${t.id} status=${t.status} qr=${t.qrToken.slice(0,12)}`);
console.log("\n=== PRODUCTS ===");
const prods = await prisma.product.findMany({ where: { restaurantId: r.id } });
for (const p of prods) console.log(` ${p.name} id=${p.id} status=${p.status} deletedAt=${p.deletedAt} avail=${p.isAvailable}`);
console.log("\n=== ORDERS (all) ===");
const orders = await prisma.order.findMany({ where: { restaurantId: r.id, branchId: branch.id }, orderBy:{createdAt:"desc"}, take:10 });
for (const o of orders) {
  const t = o.tableId ? tables.find(x=>x.id===o.tableId)?.label : "no-table";
  console.log(` #${o.orderNumber} id=${o.id.slice(0,8)} table=${t} (${o.tableId?.slice(0,8)}) status=${o.status} pay=${o.paymentStatus} type=${o.type} source=${o.source} created=${o.createdAt.toISOString()}`);
  const items = await prisma.orderItem.findMany({ where: { restaurantId: r.id, orderId: o.id } });
  for (const it of items) console.log(`    - ${it.productName} x${it.quantity} @${it.unitPrice}`);
}
console.log("\n=== SESSIONS ===");
const sessions = await prisma.tableSession.findMany({ where: { restaurantId: r.id, branchId: branch.id }, orderBy:{createdAt:"desc"}, take:10 });
for (const s of sessions) {
  const t = tables.find(x=>x.id===s.tableId)?.label;
  console.log(` session ${s.id.slice(0,8)} table=${t} status=${s.status} createdAt=${s.createdAt.toISOString()}`);
}
console.log("\n=== SESSION ORDERS ===");
const sOrders = await prisma.tableSessionOrder.findMany({ orderBy:{createdAt:"desc"}, take:10 });
for (const so of sOrders) console.log(` so ${so.id.slice(0,8)} session=${so.sessionId.slice(0,8)} num=${so.orderNumber} status=${so.status} total=${so.total}`);
await prisma.$disconnect();
