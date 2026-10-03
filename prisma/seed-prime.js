import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { GLOBAL_PERMISSIONS } from "../src/modules/permissions/permission.catalog.js";

const prisma = new PrismaClient();

function getCalendarDateStr(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function main() {
  console.log("Seeding Prime Restaurant exact data with real database records...");

  // 1. Seed global permissions
  for (const perm of GLOBAL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      update: { description: perm.description },
      create: {
        key: perm.key,
        description: perm.description,
      },
    });
  }

  // 2. Clear old temporary data
  await prisma.orderPayment.deleteMany({});
  await prisma.orderStatusHistory.deleteMany({});
  await prisma.orderItem.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.tableSessionWaiterCall.deleteMany({});
  await prisma.tableSessionItem.deleteMany({});
  await prisma.tableSessionOrder.deleteMany({});
  await prisma.tableSessionMember.deleteMany({});
  await prisma.tableSession.deleteMany({});
  await prisma.restaurantTable.deleteMany({});
  await prisma.productModifier.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.employeeBranchAccess.deleteMany({});
  await prisma.employee.deleteMany({});
  await prisma.rolePermission.deleteMany({});
  await prisma.role.deleteMany({});
  await prisma.customerAddress.deleteMany({});
  await prisma.customer.deleteMany({});
  await prisma.branchSettings.deleteMany({});
  await prisma.branch.deleteMany({});
  await prisma.restaurant.deleteMany({});

  const passwordHash = await bcrypt.hash("Password123!", 10);

  // 3. Create Prime Restaurant
  const restaurant = await prisma.restaurant.create({
    data: {
      name: "Prime Restaurant",
      slug: "prime-restaurant",
      email: "owner@restaurant.com",
      phone: "+201000000000",
    },
  });

  // 4. Create Main Branch
  const branch = await prisma.branch.create({
    data: {
      restaurantId: restaurant.id,
      name: "Prime Restaurant Main Branch",
      code: "MAIN",
      isMain: true,
      address: "شارع التحرير، القاهرة",
      phone: "+201000000000",
    },
  });

  await prisma.branchSettings.create({
    data: {
      restaurantId: restaurant.id,
      branchId: branch.id,
      currency: "EGP",
      timezone: "Africa/Cairo",
    },
  });

  // 5. Roles & Permissions
  const allPermissions = await prisma.permission.findMany();

  const ownerRole = await prisma.role.create({
    data: {
      restaurantId: restaurant.id,
      name: "Owner",
      description: "Owner with full access",
      permissions: {
        create: allPermissions.map((p) => ({
          restaurantId: restaurant.id,
          permissionId: p.id,
        })),
      },
    },
  });

  const cashierPermKeys = [
    "orders.create",
    "orders.view",
    "orders.update",
    "orders.payment",
    "orders.refund",
    "orders.source_cashier",
    "orders.source_phone",
    "menu.view",
    "tables.view",
    "tables.manage",
    "customers.view",
    "customers.create",
  ];

  const cashierPermissions = allPermissions.filter((p) => cashierPermKeys.includes(p.key));

  const cashierRole = await prisma.role.create({
    data: {
      restaurantId: restaurant.id,
      name: "Cashier",
      description: "Cashier with order handling access",
      permissions: {
        create: cashierPermissions.map((p) => ({
          restaurantId: restaurant.id,
          permissionId: p.id,
        })),
      },
    },
  });

  const waiterPermKeys = ["orders.create", "orders.view", "tables.view", "menu.view"];
  const waiterPermissions = allPermissions.filter((p) => waiterPermKeys.includes(p.key));
  await prisma.role.create({
    data: {
      restaurantId: restaurant.id,
      name: "waiter",
      description: "Waiter — dine-in table orders only",
      permissions: {
        create: waiterPermissions.map((p) => ({
          restaurantId: restaurant.id,
          permissionId: p.id,
        })),
      },
    },
  });

  // 6. Create Employees
  await prisma.employee.create({
    data: {
      restaurantId: restaurant.id,
      branchId: branch.id,
      roleId: ownerRole.id,
      name: "أحمد المالك",
      email: "owner@restaurant.com",
      passwordHash,
      branchAccesses: {
        create: {
          restaurantId: restaurant.id,
          branchId: branch.id,
        },
      },
    },
  });

  await prisma.employee.create({
    data: {
      restaurantId: restaurant.id,
      branchId: branch.id,
      roleId: cashierRole.id,
      name: "كاشير برايم",
      email: "cashier@restaurant.com",
      passwordHash,
      branchAccesses: {
        create: {
          restaurantId: restaurant.id,
          branchId: branch.id,
        },
      },
    },
  });

  // 7. Create Customers
  const customer1 = await prisma.customer.create({
    data: {
      restaurantId: restaurant.id,
      name: "أحمد محمود",
      phone: "01012345678",
    },
  });

  const customer2 = await prisma.customer.create({
    data: {
      restaurantId: restaurant.id,
      name: "سارة إبراهيم",
      phone: "01123456789",
    },
  });

  const customer3 = await prisma.customer.create({
    data: {
      restaurantId: restaurant.id,
      name: "محمود عبد الرحمن",
      phone: "01234567890",
    },
  });

  const customer4 = await prisma.customer.create({
    data: {
      restaurantId: restaurant.id,
      name: "عمر خالد",
      phone: "01555555555",
    },
  });

  // 8. Create Tables
  const tables = [];
  for (let i = 1; i <= 6; i++) {
    const table = await prisma.restaurantTable.create({
      data: {
        restaurantId: restaurant.id,
        branchId: branch.id,
        label: `طاولة ${i}`,
        capacity: i <= 2 ? 2 : i <= 4 ? 4 : 6,
        qrToken: crypto.randomBytes(16).toString("hex"),
        status: i === 1 || i === 2 ? "OCCUPIED" : "AVAILABLE",
      },
    });
    tables.push(table);
  }

  // 9. Create Categories
  const burgerCat = await prisma.category.create({
    data: {
      restaurantId: restaurant.id,
      name: "Burgers",
    },
  });

  const pizzaCat = await prisma.category.create({
    data: {
      restaurantId: restaurant.id,
      name: "Pizza",
    },
  });

  // 10. Create Products with Exact Images & Prices
  const pClassicBurger = await prisma.product.create({
    data: {
      restaurantId: restaurant.id,
      categoryId: burgerCat.id,
      name: "Classic Burger",
      ingredients: ["لحمة بقري", "خس", "طماطم", "بصل", "صوص خاص"],
      price: 250.0,
      imageUrl: "/uploads/ae315db5-674a-4357-8aed-9458f70b3a68.jpg",
    },
  });

  const pCheeseBurger = await prisma.product.create({
    data: {
      restaurantId: restaurant.id,
      categoryId: burgerCat.id,
      name: "Cheese Burger",
      ingredients: ["لحمة بقري", "جبنة شيدر", "خس", "طماطم", "صوص خاص"],
      price: 280.0,
      imageUrl: "/uploads/b826f7cb-7c2a-4b17-be10-5ce2ce2ac53e.jpg",
    },
  });

  const pDoubleBeefBurger = await prisma.product.create({
    data: {
      restaurantId: restaurant.id,
      categoryId: burgerCat.id,
      name: "Double Beef Burger",
      ingredients: ["دبل لحمة بقري", "جبنة شيدر", "خس", "طماطم", "بصل", "صوص خاص"],
      price: 350.0,
      imageUrl: "/uploads/ab8f623d-4a3e-4b19-a1b5-f8cfba5947c4.jpg",
    },
  });

  const pMargherita = await prisma.product.create({
    data: {
      restaurantId: restaurant.id,
      categoryId: pizzaCat.id,
      name: "Margherita Pizza",
      ingredients: ["عجينة إيطالي", "صوص طماطم", "موتزاريلا", "ريحان"],
      price: 300.0,
      imageUrl: "/uploads/50ac0748-61af-4348-a760-abbbe528da22.jpg",
    },
  });

  const pChickenPizza = await prisma.product.create({
    data: {
      restaurantId: restaurant.id,
      categoryId: pizzaCat.id,
      name: "Chicken Pizza",
      ingredients: ["عجينة إيطالي", "صوص طماطم", "فراخ مشوية", "فلفل ألوان", "موتزاريلا"],
      price: 350.0,
      imageUrl: "/uploads/5bd492ac-a1f2-4009-bf13-2d3769890d6e.jpg",
    },
  });

  // 11. Create Real Table Sessions for Table 1 and Table 2
  const now = new Date();
  const todayKey = getCalendarDateStr(now);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 19, 30);
  const yesterdayKey = getCalendarDateStr(yesterday);

  const pinHash1 = await bcrypt.hash("1234", 10);
  const pinHash2 = await bcrypt.hash("5678", 10);

  // Table 1 Session (Active Occupied)
  const session1 = await prisma.tableSession.create({
    data: {
      restaurantId: restaurant.id,
      branchId: branch.id,
      tableId: tables[0].id,
      pin: "1234",
      pinHash: pinHash1,
      status: "ACTIVE",
      items: {
        create: [
          {
            productId: pClassicBurger.id,
            productName: pClassicBurger.name,
            unitPrice: 250.0,
            quantity: 1,
            addedByName: "أحمد محمود",
          },
          {
            productId: pCheeseBurger.id,
            productName: pCheeseBurger.name,
            unitPrice: 280.0,
            quantity: 1,
            addedByName: "أحمد محمود",
          },
        ],
      },
      members: {
        create: [
          {
            name: "أحمد محمود",
          },
        ],
      },
    },
  });

  // Table 2 Session (Active Occupied)
  await prisma.tableSession.create({
    data: {
      restaurantId: restaurant.id,
      branchId: branch.id,
      tableId: tables[1].id,
      pin: "5678",
      pinHash: pinHash2,
      status: "ACTIVE",
      items: {
        create: [
          {
            productId: pChickenPizza.id,
            productName: pChickenPizza.name,
            unitPrice: 350.0,
            quantity: 1,
            addedByName: "سارة إبراهيم",
          },
        ],
      },
      members: {
        create: [
          {
            name: "سارة إبراهيم",
          },
        ],
      },
    },
  });

  // 12. Create Real Orders in Database (Spanning today and yesterday)
  // Order 1 (Today, Dine-in Table 1, PREPARING)
  await prisma.order.create({
    data: {
      orderNumber: 101,
      orderDate: todayKey,
      restaurantId: restaurant.id,
      branchId: branch.id,
      source: "CASHIER",
      type: "DINE_IN",
      status: "PREPARING",
      paymentStatus: "PAID",
      paymentMethod: "CASH",
      tableId: tables[0].id,
      customerId: customer1.id,
      subtotal: 530.0,
      discountAmount: 0.0,
      amountPaid: 530.0,
      total: 530.0,
      paidAt: now,
      createdAt: now,
      items: {
        create: [
          {
            restaurantId: restaurant.id,
            productId: pClassicBurger.id,
            productName: pClassicBurger.name,
            unitPrice: 250.0,
            quantity: 1,
            subtotal: 250.0,
          },
          {
            restaurantId: restaurant.id,
            productId: pCheeseBurger.id,
            productName: pCheeseBurger.name,
            unitPrice: 280.0,
            quantity: 1,
            subtotal: 280.0,
          },
        ],
      },
      payments: {
        create: {
          restaurantId: restaurant.id,
          amount: 530.0,
          paymentMethod: "CASH",
          status: "PAID",
        },
      },
    },
  });

  // Order 2 (Today, Delivery, READY)
  await prisma.order.create({
    data: {
      orderNumber: 102,
      orderDate: todayKey,
      restaurantId: restaurant.id,
      branchId: branch.id,
      source: "WHATSAPP",
      type: "DELIVERY",
      status: "READY",
      paymentStatus: "PAID",
      paymentMethod: "CARD",
      customerId: customer2.id,
      address: "15 شارع النصر، المعادي",
      subtotal: 650.0,
      discountAmount: 0.0,
      amountPaid: 650.0,
      total: 650.0,
      paidAt: now,
      createdAt: new Date(now.getTime() - 45 * 60 * 1000),
      items: {
        create: [
          {
            restaurantId: restaurant.id,
            productId: pMargherita.id,
            productName: pMargherita.name,
            unitPrice: 300.0,
            quantity: 1,
            subtotal: 300.0,
          },
          {
            restaurantId: restaurant.id,
            productId: pDoubleBeefBurger.id,
            productName: pDoubleBeefBurger.name,
            unitPrice: 350.0,
            quantity: 1,
            subtotal: 350.0,
          },
        ],
      },
      payments: {
        create: {
          restaurantId: restaurant.id,
          amount: 650.0,
          paymentMethod: "CARD",
          status: "PAID",
        },
      },
    },
  });

  // Order 3 (Today, Pickup, PENDING)
  await prisma.order.create({
    data: {
      orderNumber: 103,
      orderDate: todayKey,
      restaurantId: restaurant.id,
      branchId: branch.id,
      source: "PHONE",
      type: "PICKUP",
      status: "PENDING",
      paymentStatus: "PENDING",
      customerId: customer3.id,
      subtotal: 350.0,
      discountAmount: 0.0,
      amountPaid: 0.0,
      total: 350.0,
      createdAt: new Date(now.getTime() - 20 * 60 * 1000),
      items: {
        create: [
          {
            restaurantId: restaurant.id,
            productId: pChickenPizza.id,
            productName: pChickenPizza.name,
            unitPrice: 350.0,
            quantity: 1,
            subtotal: 350.0,
          },
        ],
      },
    },
  });

  // Order 4 (Yesterday, Dine-in Table 2, DELIVERED)
  await prisma.order.create({
    data: {
      orderNumber: 104,
      orderDate: yesterdayKey,
      restaurantId: restaurant.id,
      branchId: branch.id,
      source: "QR",
      type: "DINE_IN",
      status: "DELIVERED",
      paymentStatus: "PAID",
      paymentMethod: "CASH",
      tableId: tables[1].id,
      customerId: customer4.id,
      subtotal: 600.0,
      discountAmount: 0.0,
      amountPaid: 600.0,
      total: 600.0,
      paidAt: yesterday,
      createdAt: yesterday,
      items: {
        create: [
          {
            restaurantId: restaurant.id,
            productId: pMargherita.id,
            productName: pMargherita.name,
            unitPrice: 300.0,
            quantity: 2,
            subtotal: 600.0,
          },
        ],
      },
      payments: {
        create: {
          restaurantId: restaurant.id,
          amount: 600.0,
          paymentMethod: "CASH",
          status: "PAID",
        },
      },
    },
  });

  console.log("=== Prime Restaurant Real Data Seeded Successfully ===");
  console.log("Restaurant: Prime Restaurant");
  console.log("Branch:     Prime Restaurant Main Branch");
  console.log("Products:   5 Real Products (Burgers & Pizzas with uploaded photos)");
  console.log("Tables:     6 Real Tables (Table 1 & 2 Occupied with active sessions)");
  console.log("Orders:     4 Real Orders in Database (Today & Yesterday across all channels)");
  console.log("Cashier:    cashier@restaurant.com | Password123!");
}

main()
  .catch((e) => {
    console.error("Error seeding Prime Restaurant real data:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
