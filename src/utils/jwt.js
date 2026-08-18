import jwt from "jsonwebtoken";
import env from "../config/env.js";

/**
 * Signs an access JWT token.
 * @param {object} payload - Token payload ({ restaurantId, branchId, employeeId, role })
 * @param {object} [options] - Additional JWT sign options
 * @returns {string} Signed JWT token
 */
export function signAccessToken(payload, options = {}) {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    ...options,
  });
}

/**
 * Verifies an access JWT token.
 * @param {string} token - JWT token string
 * @returns {object} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
}

/**
 * Signs a refresh JWT token.
 * @param {object} payload - Token payload
 * @param {object} [options] - Additional JWT sign options
 * @returns {string} Signed JWT refresh token
 */
export function signRefreshToken(payload, options = {}) {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
    ...options,
  });
}

/**
 * Verifies a refresh JWT token.
 * @param {string} token - JWT refresh token string
 * @returns {object} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
export function verifyRefreshToken(token) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET);
}
