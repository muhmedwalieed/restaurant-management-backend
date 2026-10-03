import prisma from "../src/lib/prisma.js";
const r = await prisma.restaurant.findFirst();
const branch = await prisma.branch.findFirst({ where: { restaurantId: r.id } });
const table = await prisma.restaurantTable.findFirst({ where: { restaurantId: r.id, branchId: branch.id, deletedAt: null } });
console.log("Table before:", table.label, table.status, table.id);
const product = await prisma.product.findFirst({ where: { restaurantId: r.id, deletedAt: null, status: "ACTIVE" } });
console.log("Product:", product?.name, product?.id, product?.price?.toString());
if (!product) { console.log("No product found, creating one"); process.exit(0); }

// Simulate what createOrderInClient does: create order with table
import orderRepository from "../src/modules/orders/order.repository.js";
const admin = await prisma.employee.findFirst({ where: { restaurantId: r.id, email: { contains: "admin" } } });
console.log("Admin:", admin?.email, admin?.id);
const tenantContext = { restaurantId: r.id, branchId: branch.id, employeeId: admin?.id, role: "owner" };

// Try to create order via service
import orderService from "../src/modules/orders/order.service.js";
try {
  const result = await orderService.createPosOrder(tenantContext, branch.id, {
    type: "DINE_IN",
    source: "CASHIER",
    tableId: table.id,
    items: [{ productId: product.id, quantity: 1 }],
  }, `test-${Date.now()}`);
  console.log("Order created:", result.data.id, result.data.orderNumber, result.data.status, result.data.tableId);
} catch(e) {
  console.error("Create failed:", e.message, e.code, e.details);
  console.error(e.stack);
}

const tableAfter = await prisma.restaurantTable.findFirst({ where: { id: table.id } });
console.log("Table after:", tableAfter.label, tableAfter.status);

const sessions = await prisma.tableSession.findMany({ where: { restaurantId: r.id, branchId: branch.id, status: { in: ["ACTIVE","AWAITING_CONFIRMATION","CONFIRMED"] } } });
console.log("Sessions:", sessions.length);

const orders = await prisma.order.findMany({ where: { restaurantId: r.id, branchId: branch.id, tableId: table.id }, orderBy:{createdAt:"desc"}, take:3 });
console.log("Orders for table:", orders.map(o=>({id:o.id, number:o.orderNumber, status:o.status, type:o.type, tableId:o.tableId, createdAt:o.createdAt.toISOString()})));

await prisma.$disconnect();
