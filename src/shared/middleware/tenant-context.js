import { AuthenticationError } from "../errors/index.js";
import { verifyAccessToken } from "../../utils/jwt.js";

/**
 * Extracts JWT token from Authorization header or cookies, verifies it, and attaches
 * tenant context to req.tenantContext.
 *
 * @param {import("express").Request} req
 * @returns {object|null} TenantContext object or null if no valid token present
 */
function extractAndVerifyTenantContext(req) {
  const authHeader = req.headers.authorization;
  let token = null;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  } else if (req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    return null;
  }

  try {
    const payload = verifyAccessToken(token);

    if (!payload || !payload.restaurantId) {
      return null;
    }

    return {
      restaurantId: payload.restaurantId,
      branchId: payload.branchId || null,
      employeeId: payload.employeeId || null,
      role: payload.role || null,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Strict tenant context middleware: Requires valid JWT with tenant information.
 * Throws 401 AuthenticationError if missing or invalid.
 */
export function requireTenantContext(req, res, next) {
  const tenantContext = extractAndVerifyTenantContext(req);

  if (!tenantContext) {
    throw new AuthenticationError("Invalid or missing tenant authentication token");
  }

  req.tenantContext = tenantContext;
  next();
}

/**
 * Optional tenant context middleware: Attaches req.tenantContext if valid token provided.
 * Does not block request if token is missing.
 */
export function injectTenantContext(req, res, next) {
  const tenantContext = extractAndVerifyTenantContext(req);
  if (tenantContext) {
    req.tenantContext = tenantContext;
  }
  next();
}

export default requireTenantContext;
