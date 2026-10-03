import prisma from "../src/lib/prisma.js";

async function main() {
  console.log("=== Seeding Active KDS Kitchen Orders ===");

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: "prime-restaurant" },
    include: { branches: true, products: true, tables: true },
  });

  if (!restaurant || !restaurant.branches[0]) {
    throw new Error("Prime Restaurant not found!");
  }

  const branch = restaurant.branches[0];
  const products = restaurant.products;
  const tables = restaurant.tables;

  if (products.length === 0) {
    throw new Error("No products found for Prime Restaurant!");
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const table1 = tables[0];
  const p1 = products[0];
  const p2 = products[1] || products[0];

  // Delete any conflicting test orders for today with #205 and #206
  await prisma.order.deleteMany({
    where: {
      restaurantId: restaurant.id,
      branchId: branch.id,
      orderDate: todayStr,
      orderNumber: { in: [205, 206] },
    },
  });

  const order1 = await prisma.order.create({
    data: {
      restaurantId: restaurant.id,
      branchId: branch.id,
      orderNumber: 205,
      orderDate: todayStr,
      type: "DINE_IN",
      source: "QR",
      status: "CONFIRMED",
      paymentStatus: "PENDING",
      subtotal: Number(p1.price) * 2 + Number(p2.price),
      discountAmount: 0,
      total: Number(p1.price) * 2 + Number(p2.price),
      tableId: table1?.id || null,
      notes: "بدون بصل وبدون شطة من فضلك",
      items: {
        create: [
          {
            restaurantId: restaurant.id,
            productId: p1.id,
            productName: p1.name,
            quantity: 2,
            unitPrice: p1.price,
            subtotal: Number(p1.price) * 2,
            notes: "مستوي زيادة (Well Done)",
          },
          {
            restaurantId: restaurant.id,
            productId: p2.id,
            productName: p2.name,
            quantity: 1,
            unitPrice: p2.price,
            subtotal: Number(p2.price),
            notes: "صلصة إضافية",
          },
        ],
      },
    },
  });

  const table2 = tables[1] || tables[0];
  const order2 = await prisma.order.create({
    data: {
      restaurantId: restaurant.id,
      branchId: branch.id,
      orderNumber: 206,
      orderDate: todayStr,
      type: "DINE_IN",
      source: "CASHIER",
      status: "PREPARING",
      paymentStatus: "PAID",
      subtotal: Number(p1.price),
      discountAmount: 0,
      total: Number(p1.price),
      tableId: table2?.id || null,
      items: {
        create: [
          {
            restaurantId: restaurant.id,
            productId: p1.id,
            productName: p1.name,
            quantity: 1,
            unitPrice: p1.price,
            subtotal: Number(p1.price),
          },
        ],
      },
    },
  });

  console.log("Created 2 active KDS orders successfully:", {
    order1: `#${order1.orderNumber} (${order1.status})`,
    order2: `#${order2.orderNumber} (${order2.status})`,
  });

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Error seeding KDS orders:", e);
  await prisma.$disconnect();
  process.exit(1);
});
