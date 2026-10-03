import prisma from "../src/lib/prisma.js";

const target =
  process.env.DEMO_RESTAURANT_SLUG || process.env.DEMO_RESTAURANT_ID || process.argv[2];

if (!target) {
  console.error(
    "Refusing to run: specify the target restaurant explicitly so demo data cannot\n" +
      "be written into an arbitrary tenant.\n" +
      "  DEMO_RESTAURANT_SLUG=<slug> node scripts/seed-demo-menu.mjs\n" +
      "  or: node scripts/seed-demo-menu.mjs <slug-or-id>"
  );
  process.exit(1);
}

const r =
  (await prisma.restaurant.findFirst({ where: { slug: target } })) ||
  (await prisma.restaurant.findFirst({ where: { id: target } }));

if (!r) {
  console.error(`Restaurant '${target}' not found. Aborting without changes.`);
  process.exit(1);
}

console.log("restaurant", r.id, r.name);
let cat = await prisma.category.findFirst({ where: { restaurantId: r.id, name: "مشروبات" } });
if (!cat) {
  cat = await prisma.category.create({ data: { restaurantId: r.id, name: "مشروبات", status: "ACTIVE", sortOrder: 1 } });
  console.log("Created category", cat.name);
}
let cat2 = await prisma.category.findFirst({ where: { restaurantId: r.id, name: "وجبات" } });
if (!cat2) {
  cat2 = await prisma.category.create({ data: { restaurantId: r.id, name: "وجبات", status: "ACTIVE", sortOrder: 2 } });
  console.log("Created category", cat2.name);
}
const prods = [
  { name: "شاي", price: 15, categoryId: cat.id },
  { name: "قهوة", price: 25, categoryId: cat.id },
  { name: "برجر", price: 85, categoryId: cat2.id },
  { name: "بيتزا مارجريتا", price: 120, categoryId: cat2.id },
];
for (const p of prods) {
  const exists = await prisma.product.findFirst({ where: { restaurantId: r.id, name: p.name } });
  if (!exists) {
    const created = await prisma.product.create({ data: { restaurantId: r.id, categoryId: p.categoryId, name: p.name, price: p.price, status: "ACTIVE", isAvailable: true } });
    console.log("Created product", created.name);
  } else {
    console.log("Exists", p.name);
  }
}
console.log("Done");
await prisma.$disconnect();
