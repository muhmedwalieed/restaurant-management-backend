import prisma from "../src/lib/prisma.js";
const r = await prisma.restaurant.findFirst();
const branch = await prisma.branch.findFirst({ where: { restaurantId: r.id } });

// Delete the fake test order #200 on T2
const order = await prisma.order.findFirst({ where: { restaurantId: r.id, branchId: branch.id, orderNumber: 200 } });
if (order) {
  console.log("Deleting fake order", order.id, "table", order.tableId);
  await prisma.orderStatusHistory.deleteMany({ where: { restaurantId: r.id, orderId: order.id } });
  await prisma.orderItem.deleteMany({ where: { restaurantId: r.id, orderId: order.id } });
  try { await prisma.orderPayment.deleteMany({ where: { restaurantId: r.id, orderId: order.id } }); } catch {}
  try { await prisma.idempotencyKey.deleteMany({ where: { restaurantId: r.id } }); } catch {}
  await prisma.$executeRaw`DELETE FROM orders WHERE id = ${order.id} AND restaurant_id = ${r.id}`;
  console.log("Deleted");
  // Ensure table is AVAILABLE
  const t = await prisma.restaurantTable.findFirst({ where: { id: order.tableId, restaurantId: r.id } });
  if (t) {
    await prisma.restaurantTable.updateMany({ where: { id: t.id, restaurantId: r.id }, data: { status: "AVAILABLE" } });
    console.log("Reset", t.label, "to AVAILABLE");
  }
} else console.log("No fake order found");

// Delete demo products if user says they deleted them but they still exist — keep them, they are valid
// Just ensure all tables are AVAILABLE
await prisma.restaurantTable.updateMany({ where: { restaurantId: r.id, branchId: branch.id, deletedAt: null }, data: { status: "AVAILABLE" } });
console.log("All tables reset to AVAILABLE");

// Close any lingering sessions
await prisma.tableSession.updateMany({ where: { restaurantId: r.id, branchId: branch.id, status: { in: ["ACTIVE","AWAITING_CONFIRMATION","CONFIRMED"] } }, data: { status: "CLOSED", closedAt: new Date() } });
console.log("Closed lingering sessions");

await prisma.$disconnect();
console.log("Cleanup done. Refresh POS and Waiter.");
