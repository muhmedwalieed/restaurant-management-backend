import { assertTenantContext } from "../middleware/tenant-context.js";
import { getPaginationOffset } from "../utils/pagination.js";

export const ACTOR_SUMMARY_SELECT = Object.freeze({
  id: true,
  name: true,
  email: true,
});

export const CUSTOMER_SUMMARY_SELECT = Object.freeze({
  id: true,
  name: true,
  phone: true,
});

export const BRANCH_SUMMARY_SELECT = Object.freeze({
  id: true,
  name: true,
  code: true,
  isMain: true,
  status: true,
});

export function buildDateRangeFilter(from, to) {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: new Date(from) } : {}),
    ...(to ? { lte: new Date(to) } : {}),
  };
}

export class BaseRepository {
  assertTenant(tenantContext) {
    return assertTenantContext(tenantContext);
  }

  getPaginationOffset(page, limit) {
    return getPaginationOffset(page, limit);
  }

  buildDateRangeFilter(from, to) {
    return buildDateRangeFilter(from, to);
  }
}

export { assertTenantContext, getPaginationOffset };

export default BaseRepository;
