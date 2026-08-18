import prisma from "../lib/prisma.js";

/**
 * Re-exports the primary Prisma client instance for unified configuration access.
 */
export { prisma };
export default prisma;

/**
 * Checks the PostgreSQL database connection readiness.
 * Executing a lightweight raw query `SELECT 1`.
 * @returns {Promise<boolean>}
 */
export async function checkDatabaseHealth() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    return false;
  }
}
