import prisma from "../src/lib/prisma.js";
const r = await prisma.restaurant.findFirst();
const branch = await prisma.branch.findFirst({ where: { restaurantId: r.id } });
// Find the last POS order that used T2 (or any DINE_IN order)
const orders = await prisma.order.findMany({ where: { restaurantId: r.id, branchId: branch.id, type: "DINE_IN" }, orderBy:{createdAt:"desc"}, take:5 });
console.log("Recent DINE_IN orders:", orders.map(o=>({num:o.orderNumber, tableId:o.tableId, status:o.status, createdAt:o.createdAt.toISOString()})));
for (const o of orders) {
  if (o.tableId) {
    const t = await prisma.restaurantTable.findFirst({ where: { id: o.tableId, restaurantId: r.id } });
    console.log(`Table ${t?.label} current status:`, t?.status);
    if (t && t.status !== "OCCUPIED" && o.status !== "DELIVERED" && o.status !== "CANCELLED") {
      await prisma.restaurantTable.updateMany({ where: { id: t.id, restaurantId: r.id }, data: { status: "OCCUPIED" } });
      console.log(`Fixed ${t.label} -> OCCUPIED`);
    }
  }
}
await prisma.$disconnect();
console.log("Done");
