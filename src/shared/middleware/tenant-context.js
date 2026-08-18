import { AuthenticationError } from "../errors/index.js";

/**
 * Strict tenant context guard middleware.
 * Verifies that req.tenantContext has been injected and contains a valid restaurantId.
 * Zero DB overhead / Zero verification duplicate.
 */
export function requireTenantContext(req, res, next) {
  if (!req.tenantContext || !req.tenantContext.restaurantId) {
    throw new AuthenticationError("Tenant context required for this endpoint");
  }
  next();
}

/**
 * Optional tenant context guard middleware.
 */
export function injectTenantContext(req, res, next) {
  next();
}

export default requireTenantContext;
