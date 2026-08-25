import bcrypt from "bcrypt";
import env from "../../config/env.js";

export async function hashPassword(plainPassword) {
  const rounds = env.BCRYPT_ROUNDS || 10;
  return bcrypt.hash(plainPassword, rounds);
}

export async function verifyPassword(plainPassword, passwordHash) {
  if (!plainPassword || !passwordHash) {
    return false;
  }
  return bcrypt.compare(plainPassword, passwordHash);
}

export default {
  hashPassword,
  verifyPassword,
};
