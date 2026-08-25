import { AuthenticationError } from "../errors/index.js";

export function requireTenantContext(req, res, next) {
  if (!req.tenantContext || !req.tenantContext.restaurantId) {
    throw new AuthenticationError("Tenant context required for this endpoint");
  }
  next();
}

export function injectTenantContext(req, res, next) {
  next();
}

export default requireTenantContext;
