/**
 * Canonical Global Permissions Catalog (Global-scoped entities).
 * Format: resource.action
 */
export const GLOBAL_PERMISSIONS = [
  { key: "employees.view", description: "View employee profiles and list" },
  { key: "employees.manage", description: "Create, update, and soft-delete employees" },
  { key: "employees.manage_roles", description: "Manage roles, permissions, and role assignments" },
  { key: "restaurants.manage", description: "Manage restaurant profile and settings" },
  { key: "branches.manage", description: "Manage branch profiles and settings" },
  { key: "menu.manage", description: "Manage restaurant categories, products, prices, and add-ons" },
  { key: "menu.view", description: "View the restaurant menu (products/categories/modifiers) — for cashiers and POS" },
  { key: "tables.manage", description: "Manage branch tables, status, and QR codes" },
  { key: "tables.view", description: "View branch tables (for POS table selection) — without management rights" },
  { key: "orders.view", description: "View branch orders and order timeline history" },
  { key: "orders.create", description: "Create new branch orders" },
  { key: "orders.update", description: "Update order details and advance order state machine" },
  { key: "orders.cancel", description: "Cancel active orders and record cancellation reason" },
  { key: "orders.payment", description: "Process order payment transactions" },
  { key: "orders.refund", description: "Process order refund transactions" },
  { key: "customers.view", description: "View customer profiles, order history, and addresses" },
  { key: "customers.create", description: "Create new customer profiles" },
  { key: "customers.update", description: "Update customer profiles and manage addresses" },
  { key: "customers.delete", description: "Soft-delete customer profiles" },
  { key: "whatsapp.view", description: "View WhatsApp connection and message history" },
  { key: "whatsapp.manage", description: "Connect/disconnect WhatsApp and send messages" },
  { key: "chats.view", description: "View the unified inbox queue and conversations" },
  { key: "chats.reply", description: "Reply to inbox conversations and add internal notes" },
  { key: "chats.assign", description: "Assign and claim inbox conversations from the queue" },
  { key: "chats.close", description: "Resolve and close inbox conversations" },
  { key: "chats.takeover", description: "Take over, lock, return and reassign inbox conversations" },
  { key: "dashboard.view", description: "View restaurant analytics dashboards and reports" },
  { key: "coupons.manage", description: "Create, update, deactivate and manage discount coupons" },
  { key: "notifications.view", description: "View and manage own in-app notifications and preferences" },
  { key: "audit.view", description: "View restaurant audit log entries and search history" },
];

export default GLOBAL_PERMISSIONS;
