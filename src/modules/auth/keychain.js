import bcrypt from "bcrypt";
import env from "../../config/env.js";

/**
 * Hashes a plain text password using bcrypt.
 * @param {string} plainPassword
 * @returns {Promise<string>} Password hash
 */
export async function hashPassword(plainPassword) {
  const rounds = env.BCRYPT_ROUNDS || 10;
  return bcrypt.hash(plainPassword, rounds);
}

/**
 * Verifies a plain text password against a stored bcrypt hash.
 * @param {string} plainPassword
 * @param {string} passwordHash
 * @returns {Promise<boolean>} True if password matches
 */
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
