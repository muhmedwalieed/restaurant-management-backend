import prisma from "./src/lib/prisma.js";

const qrToken = "599fa7fb9f3c539eafb90cf0f0dca7ae";
const table = await prisma.$queryRawUnsafe(
  `SELECT id, restaurant_id, branch_id, label FROM tables WHERE qr_token = $1 LIMIT 1`,
  qrToken
);
console.log("TABLE:", JSON.stringify(table));
if (table && table[0]) {
  const sessions = await prisma.$queryRawUnsafe(
    `SELECT id, status, pin, table_id, "created_at", "closed_at"
     FROM table_sessions WHERE table_id = $1 ORDER BY "created_at" DESC LIMIT 5`,
    table[0].id
  );
  console.log("SESSIONS:", JSON.stringify(sessions, null, 2));
}
await prisma.$disconnect();