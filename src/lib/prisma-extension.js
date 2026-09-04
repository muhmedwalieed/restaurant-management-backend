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
  "Order",
  "OrderItem",
  "OrderStatusHistory",
  "IdempotencyKey",
  "Customer",
  "CustomerPhone",
  "CustomerAddress",
  "WhatsAppConnection",
  "WhatsAppMessage",
  "WebhookEvent",
  "WhatsAppConversation",
  "InboxConversation",
  "InboxMessage",
  "InboxTicketLog",
  "Coupon",
  "Notification",
  "NotificationPreference",
  "AuditLog",
  // Parent session row is tenant-scoped. Child TableSession* models have no
  // restaurantId column — isolation is via sessionId FK only.
  "TableSession",
]);

function hasRestaurantId(obj) {
  return obj !== null && typeof obj === "object" && obj.restaurantId !== undefined && obj.restaurantId !== null;
}

export function applyTenantSafetyNetExtension(client) {
  return client.$extends({
    name: "tenant-safety-net",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (model && TENANT_SCOPED_MODELS.has(model)) {
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

            const isUniqueQuery = ["findUnique", "findUniqueOrThrow", "update", "delete"].includes(
              operation
            );

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
