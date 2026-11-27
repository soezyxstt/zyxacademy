export const staffRoles = {
  tutor: {
    label: "Tutor",
    route: "/tutor",
    apiPath: "/api/native/academic/tutor/dashboard",
    recordId: "native-preview-tutor-course",
    recordTitle: "Preview Tutor Course",
  },
  admin: {
    label: "Admin",
    route: "/admin/forms?tab=forms",
    apiPath: "/api/admin/custom-forms",
    recordId: "native-preview-admin-form",
    recordTitle: "Preview Admin Form",
  },
} as const;

export type StaffRole = keyof typeof staffRoles;

export function staffRole(value: string | undefined): StaffRole | undefined {
  if (value === undefined || value === "student") return undefined;
  if (value === "tutor" || value === "admin") return value;
  throw new Error("Invalid authenticated preview role");
}

export function oppositeStaffRole(role: StaffRole): StaffRole {
  return role === "tutor" ? "admin" : "tutor";
}

export function containsStaffRecord(role: StaffRole, payload: unknown): boolean {
  if (typeof payload !== "object" || payload === null) return false;
  const model = payload as Record<string, unknown>;
  const rows = role === "tutor" ? model.courses : model.success === true ? model.forms : null;
  const { recordId, recordTitle } = staffRoles[role];
  return Array.isArray(rows) && rows.some(row => row?.[role === "tutor" ? "courseId" : "id"] === recordId && row.title === recordTitle);
}

export function matchesStaffContext(role: StaffRole, payload: unknown, identity: { accountId: string; sessionId: string }): boolean {
  if (typeof payload !== "object" || payload === null) return false;
  const context = payload as Record<string, unknown>;
  return context.accountId === identity.accountId && context.sessionId === identity.sessionId &&
    Array.isArray(context.roles) && context.roles.length === 1 && context.roles[0] === role;
}
