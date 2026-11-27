export const adminUserStatuses = ["active", "suspended"] as const;
export type AdminUserStatus = typeof adminUserStatuses[number];
export type AdminUserStatusRevision = { status: AdminUserStatus; revision: string };
export type AdminUserStatusEdit = { accountId: string; status: AdminUserStatus; expectedRevision: string };

export function isAdminUserStatusRevision(value: unknown): value is AdminUserStatusRevision {
  return Boolean(value && typeof value === "object" && "status" in value && "revision" in value
    && (value.status === "active" || value.status === "suspended")
    && typeof value.revision === "string" && /^[a-f0-9]{64}$/.test(value.revision));
}
