import { PrismaClient } from "@prisma/client";
import { applyTenantSafetyNetExtension } from "./prisma-extension.js";

const basePrisma = new PrismaClient();
const prisma = applyTenantSafetyNetExtension(basePrisma);

export default prisma;