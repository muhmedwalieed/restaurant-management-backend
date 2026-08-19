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
];

/**
 * Returns array of all canonical permission keys.
 * @returns {string[]}
 */
export function getPermissionKeys() {
  return GLOBAL_PERMISSIONS.map((p) => p.key);
}

export default GLOBAL_PERMISSIONS;
