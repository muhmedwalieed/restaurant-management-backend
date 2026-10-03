import prisma from "../src/lib/prisma.js";
const r = await prisma.restaurant.findFirst();
console.log("restaurant", r.id, r.name);
const branches = await prisma.branch.findMany({ where: { restaurantId: r.id } });
console.log("branches", branches.map(b=>({id:b.id, name:b.name, isMain:b.isMain})));
for (const b of branches) {
  const tables = await prisma.restaurantTable.findMany({ where: { restaurantId: r.id, branchId: b.id, deletedAt: null } });
  console.log(`\nBranch ${b.name} (${b.id}) tables:`, tables.length);
  for (const t of tables) console.log(`  - ${t.label} id=${t.id} status=${t.status} qr=${t.qrToken.slice(0,8)}`);
  const sessions = await prisma.tableSession.findMany({ where: { restaurantId: r.id, branchId: b.id, status: { in: ["ACTIVE","AWAITING_CONFIRMATION","CONFIRMED"] } }, include: { table: { select:{label:true} } } });
  console.log(`  sessions active:`, sessions.length);
  for (const s of sessions) console.log(`    session ${s.id} table=${s.table?.label} status=${s.status} createdAt=${s.createdAt.toISOString()} pin=${s.pin}`);
  const orders = await prisma.order.findMany({ where: { restaurantId: r.id, branchId: b.id, type:"DINE_IN", status:{ notIn:["DELIVERED","CANCELLED"] } }, orderBy:{createdAt:"desc"}, take:5 });
  console.log(`  recent DINE_IN orders:`, orders.length);
  for (const o of orders) console.log(`    order #${o.orderNumber} id=${o.id} tableId=${o.tableId} status=${o.status} payment=${o.paymentStatus} total=${o.total} createdAt=${o.createdAt.toISOString()}`);
}
await prisma.$disconnect();
