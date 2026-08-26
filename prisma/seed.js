import prisma from "../src/lib/prisma.js";
import { GLOBAL_PERMISSIONS } from "../src/modules/permissions/permission.catalog.js";
import logger from "../src/config/logger.js";

export async function seedPermissions() {
  logger.info("Starting global permissions seeding...");

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

  logger.info("Global permissions seeded successfully.");
}

async function main() {
  try {
    await seedPermissions();
  } catch (error) {
    logger.error({ err: error }, "Failed to seed permissions:");
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && process.argv[1].endsWith("seed.js")) {
  main();
}
