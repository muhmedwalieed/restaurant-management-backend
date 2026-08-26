import { AuthenticationError } from "../errors/index.js";

export function requireTenantContext(req, res, next) {
  if (!req.tenantContext || !req.tenantContext.restaurantId) {
    throw new AuthenticationError("Tenant context required for this endpoint");
  }
  next();
}

export function assertTenantContext(tenantContext) {
  if (!tenantContext || !tenantContext.restaurantId) {
    throw new AuthenticationError("TenantContext with restaurantId is required");
  }
  return tenantContext;
}

export default requireTenantContext;
