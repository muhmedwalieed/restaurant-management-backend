import prisma from "../lib/prisma.js";

export { prisma };
export default prisma;

export async function checkDatabaseHealth() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    return false;
  }
}
