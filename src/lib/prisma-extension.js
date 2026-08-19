import env from "../config/env.js";

/**
 * List of Prisma models that are tenant-scoped and require explicit `restaurantId`.
 * Note: Restaurant is the tenant root itself.
 * Tenant-scoped models (e.g. Branch, Employee, Role, Session, Category, Product, ProductModifier, RestaurantTable, etc.) possess a `restaurantId` field.
 */
const TENANT_SCOPED_MODELS = new Set([
  "Branch",
  "Employee",
  "Role",
  "RolePermission",
  "Session",
  "EmployeeBranchAccess",
  "WorkingHours",
  "BranchSettings",
  "Category",
  "Product",
  "ProductModifier",
  "RestaurantTable",
]);

/**
 * Helper to check if restaurantId is defined and non-null in a target object.
 * @param {object} obj
 * @returns {boolean}
 */
function hasRestaurantId(obj) {
  return obj !== null && typeof obj === "object" && obj.restaurantId !== undefined && obj.restaurantId !== null;
}

/**
 * Prisma Client Extension implementing the Tenant Isolation Safety-Net (Section 12.3).
 *
 * This extension acts as a developer detection / CI safety net in non-production environments
 * (development, test, ci). It inspects queries targeting tenant-scoped models and verifies that
 * `restaurantId` is explicitly provided.
 *
 * NOTE ON RAW QUERIES: Raw SQL queries (`$queryRaw`, `$executeRaw`) bypass Prisma query middleware
 * and cannot be inspected by this extension. Developers must manually enforce explicit scoping in raw SQL.
 *
 * @param {import("@prisma/client").PrismaClient} client
 */
export function applyTenantSafetyNetExtension(client) {
  if (env.NODE_ENV === "production") {
    return client;
  }

  return client.$extends({
    name: "tenant-safety-net",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (model && TENANT_SCOPED_MODELS.has(model)) {
            // Case (a): Queries with `where` clauses (read / bulk operations)
            const isWhereQuery = [
              "findFirst",
              "findMany",
              "findFirstOrThrow",
              "count",
              "updateMany",
              "deleteMany",
              "aggregate",
              "groupBy",
            ].includes(operation);

            if (isWhereQuery) {
              if (!args?.where || !hasRestaurantId(args.where)) {
                throw new Error(
                  `[Tenant Safety-Net Violation]: Query on model '${model}' operation '${operation}' executed without explicit restaurantId in where clause.`
                );
              }
            }

            // Case (b): Creation operations (create, createMany)
            if (operation === "create") {
              if (!args?.data || !hasRestaurantId(args.data)) {
                throw new Error(
                  `[Tenant Safety-Net Violation]: Create on model '${model}' executed without explicit restaurantId in data payload.`
                );
              }
            }

            if (operation === "createMany") {
              const dataArray = Array.isArray(args?.data) ? args.data : [args?.data];
              const missingInAny = !args?.data || dataArray.some((item) => !hasRestaurantId(item));
              if (missingInAny) {
                throw new Error(
                  `[Tenant Safety-Net Violation]: CreateMany on model '${model}' executed without explicit restaurantId in data payload.`
                );
              }
            }

            // Case (c): Single-record queries / mutations (findUnique, findUniqueOrThrow, update, delete)
            const isUniqueQuery = [
              "findUnique",
              "findUniqueOrThrow",
              "update",
              "delete",
            ].includes(operation);

            if (isUniqueQuery) {
              if (!args?.where || !hasRestaurantId(args.where)) {
                throw new Error(
                  `[Tenant Safety-Net Violation]: Operation '${operation}' on model '${model}' executed without explicit restaurantId in where clause.`
                );
              }
            }
          }

          return query(args);
        },
      },
    },
  });
}

export default applyTenantSafetyNetExtension;
