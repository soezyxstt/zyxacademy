export const adminUserRoles = ["admin", "tutor", "murid"] as const;
export type AdminUserRole = typeof adminUserRoles[number];
export type AdminUserRolesRevision = { roles: AdminUserRole[]; revision: string };
export type AdminUserRolesEdit = { accountId: string; roles: AdminUserRole[]; expectedRevision: string; confirmed: true };

export function isAdminUserRolesRevision(value: unknown): value is AdminUserRolesRevision {
  if (!value || typeof value !== "object" || !("revision" in value) || typeof value.revision !== "string"
    || !/^[a-f0-9]{64}$/.test(value.revision) || !("roles" in value) || !Array.isArray(value.roles)) return false;
  return value.roles.length <= adminUserRoles.length
    && value.roles.every((role) => adminUserRoles.includes(role)) && new Set(value.roles).size === value.roles.length;
}
