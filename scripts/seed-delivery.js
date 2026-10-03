import prisma from "../src/lib/prisma.js";
import { hashPassword } from "../src/modules/auth/keychain.js";

async function main() {
  console.log("=== Seeding Delivery Role, Driver, and Delivery Orders ===");

  // 1. Find the Prime Restaurant
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: "prime-restaurant" },
    include: { branches: true, products: true },
  });

  if (!restaurant || !restaurant.branches[0]) {
    throw new Error("Prime Restaurant or its main branch not found!");
  }

  const branch = restaurant.branches[0];
  const products = restaurant.products;

  // 2. Permissions Needed
  const deliveryPerms = [
    { key: "delivery.view", name: "View Delivery Orders", nameAr: "عرض طلبات التوصيل ومحفظة العهدة" },
    { key: "delivery.update_status", name: "Update Delivery Status", nameAr: "تحديث حالة التوصيل" },
    { key: "delivery.settle", name: "Settle Driver Cash", nameAr: "تصفية واستلام عهدة التوصيل (COD)" },
  ];

  for (const p of deliveryPerms) {
    let perm = await prisma.permission.findUnique({ where: { key: p.key } });
    if (!perm) {
      perm = await prisma.permission.create({
        data: {
          key: p.key,
          description: p.name,
        },
      });
      console.log(`Created permission: ${p.key}`);
    }
  }

  // 3. Find or Create Role 'delivery' (طيار / مندوب توصيل)
  let driverRole = await prisma.role.findFirst({
    where: {
      restaurantId: restaurant.id,
      name: { in: ["delivery", "driver", "طيار", "مندوب توصيل", "Delivery"] },
    },
  });

  if (!driverRole) {
    console.log("Creating Role 'delivery'...");
    driverRole = await prisma.role.create({
      data: {
        restaurantId: restaurant.id,
        name: "delivery",
        description: "Delivery Drivers & Couriers",
        isSystem: false,
      },
    });
  }

  // Assign driver permissions (view and update_status) to delivery role
  for (const pKey of ["delivery.view", "delivery.update_status"]) {
    const permDef = await prisma.permission.findUnique({ where: { key: pKey } });
    const existing = await prisma.rolePermission.findFirst({
      where: {
        restaurantId: restaurant.id,
        roleId: driverRole.id,
        permissionId: permDef.id,
      },
    });
    if (!existing) {
      await prisma.rolePermission.create({
        data: {
          restaurantId: restaurant.id,
          roleId: driverRole.id,
          permissionId: permDef.id,
        },
      });
    }
  }

  // Also assign delivery.settle to Owner and Cashier roles if they exist
  const cashierRoles = await prisma.role.findMany({
    where: {
      restaurantId: restaurant.id,
      name: { in: ["cashier", "كاشير", "owner", "admin"] },
    },
  });
  const settlePerm = await prisma.permission.findUnique({ where: { key: "delivery.settle" } });
  for (const cr of cashierRoles) {
    const hasSettle = await prisma.rolePermission.findFirst({
      where: { restaurantId: restaurant.id, roleId: cr.id, permissionId: settlePerm.id },
    });
    if (!hasSettle) {
      await prisma.rolePermission.create({
        data: {
          restaurantId: restaurant.id,
          roleId: cr.id,
          permissionId: settlePerm.id,
        },
      });
    }
  }

  // 4. Create or Update Driver Employee: driver@restaurant.com
  const driverEmail = "driver@restaurant.com";
  const plainPassword = "Password123!";
  const passwordHash = await hashPassword(plainPassword);

  let driverEmployee = await prisma.employee.findFirst({
    where: {
      restaurantId: restaurant.id,
      email: driverEmail,
    },
  });

  if (!driverEmployee) {
    console.log(`Creating employee ${driverEmail}...`);
    driverEmployee = await prisma.employee.create({
      data: {
        restaurantId: restaurant.id,
        branchId: branch.id,
        roleId: driverRole.id,
        name: "محمد طيار (مندوب التوصيل)",
        email: driverEmail,
        passwordHash,
        phone: "01012345678",
        status: "ACTIVE",
      },
    });

    await prisma.employeeBranchAccess.create({
      data: {
        restaurantId: restaurant.id,
        employeeId: driverEmployee.id,
        branchId: branch.id,
      },
    });
  } else {
    console.log(`Updating employee ${driverEmail}...`);
    await prisma.employee.updateMany({
      where: { id: driverEmployee.id, restaurantId: restaurant.id },
      data: {
        roleId: driverRole.id,
        branchId: branch.id,
        passwordHash,
        status: "ACTIVE",
      },
    });
  }

  // 5. Seed Customer and Sample Delivery Orders
  let customer1 = await prisma.customer.findFirst({
    where: { restaurantId: restaurant.id, phone: "01098765432" },
  });
  if (!customer1) {
    customer1 = await prisma.customer.create({
      data: {
        restaurantId: restaurant.id,
        name: "أحمد محمود",
        phone: "01098765432",
      },
    });
  }

  let customer2 = await prisma.customer.findFirst({
    where: { restaurantId: restaurant.id, phone: "01122334455" },
  });
  if (!customer2) {
    customer2 = await prisma.customer.create({
      data: {
        restaurantId: restaurant.id,
        name: "سارة إبراهيم",
        phone: "01122334455",
      },
    });
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const p1 = products[0];
  const p2 = products[1] || products[0];

  // Clean old sample delivery orders
  await prisma.order.deleteMany({
    where: {
      restaurantId: restaurant.id,
      branchId: branch.id,
      orderDate: todayStr,
      orderNumber: { in: [301, 302] },
    },
  });

  // Order #301: READY for delivery pickup (COD)
  const order1 = await prisma.order.create({
    data: {
      restaurantId: restaurant.id,
      branchId: branch.id,
      orderNumber: 301,
      orderDate: todayStr,
      type: "DELIVERY",
      source: "PHONE",
      status: "READY",
      paymentStatus: "PENDING",
      subtotal: Number(p1.price) * 2,
      discountAmount: 0,
      total: Number(p1.price) * 2,
      customerId: customer1.id,
      address: "شارع التحرير - عمارة 15 - الدور 4 - شقة 12 (بجوار محطة المترو)",
      notes: "رن الجرس 3 مرات من فضلك - معاك فكة 500",
      items: {
        create: [
          {
            restaurantId: restaurant.id,
            productId: p1.id,
            productName: p1.name,
            quantity: 2,
            unitPrice: p1.price,
            subtotal: Number(p1.price) * 2,
            notes: "زيادة صوص الكاتشب",
          },
        ],
      },
    },
  });

  // Order #302: OUT_FOR_DELIVERY (Prepaid Card)
  const order2 = await prisma.order.create({
    data: {
      restaurantId: restaurant.id,
      branchId: branch.id,
      orderNumber: 302,
      orderDate: todayStr,
      type: "DELIVERY",
      source: "WEBSITE",
      status: "OUT_FOR_DELIVERY",
      paymentStatus: "PAID",
      paymentMethod: "CARD",
      amountPaid: Number(p2.price),
      paidAt: new Date(),
      subtotal: Number(p2.price),
      discountAmount: 0,
      total: Number(p2.price),
      customerId: customer2.id,
      address: "حي النرجس - فيلا 42 - التجمع الخامس",
      notes: "اترك الطلب عند الأمن",
      items: {
        create: [
          {
            restaurantId: restaurant.id,
            productId: p2.id,
            productName: p2.name,
            quantity: 1,
            unitPrice: p2.price,
            subtotal: Number(p2.price),
          },
        ],
      },
    },
  });

  console.log("=== Delivery Seed Completed Successfully ===");
  console.log(JSON.stringify({
    driverEmail,
    password: plainPassword,
    role: "delivery",
    targetUrl: "http://prime-restaurant.localhost:5173/delivery",
    sampleOrders: [
      `#${order1.orderNumber} (${order1.status}) - COD ${order1.total} EGP`,
      `#${order2.orderNumber} (${order2.status}) - PAID ${order2.total} EGP`,
    ],
  }, null, 2));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Error seeding delivery:", e);
  await prisma.$disconnect();
  process.exit(1);
});
