import prisma from "../src/lib/prisma.js";
const r = await prisma.restaurant.findFirst();
const cats = await prisma.category.findMany({ where: { restaurantId: r.id } });
console.log("cats", cats.length, cats.map(c=>({name:c.name, id:c.id})));
const prods = await prisma.product.findMany({ where: { restaurantId: r.id } });
console.log("prods", prods.length, prods.slice(0,3).map(p=>({name:p.name, status:p.status, deletedAt:p.deletedAt, avail:p.isAvailable})));
await prisma.$disconnect();
