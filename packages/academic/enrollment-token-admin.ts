import type { StudyGroupCourse } from "./study-group-edit";

export type EnrollmentTokenIssue = { courseIds: string[]; capacity: number; totalQuotaSessions: number; weeklyQuotaSessions: number };
export type EnrollmentTokenDetails = {
  id: string;
  revision: string;
  status: "active" | "expired";
  expiresAt: string;
  capacity: number;
  used: number;
  courses: StudyGroupCourse[];
};
export type EnrollmentTokenEditor = { type: "issue"; courses: StudyGroupCourse[] } | { type: "token"; token: EnrollmentTokenDetails };
export type EnrollmentTokenWrite = { type: "issue"; fields: EnrollmentTokenIssue }
  | { type: "revoke"; id: string; fields: { expectedRevision: string } };

export function validateEnrollmentTokenIssue(input: EnrollmentTokenIssue) {
  if (!input.courseIds.length || input.courseIds.length > 100 || new Set(input.courseIds).size !== input.courseIds.length) return "Pilih setidaknya satu mata kuliah.";
  if (!Number.isSafeInteger(input.capacity) || input.capacity < 1 || input.capacity > 1000) return "Kapasitas harus berupa bilangan bulat 1 sampai 1.000.";
  if (![input.totalQuotaSessions, input.weeklyQuotaSessions].every((quota) => Number.isSafeInteger(quota) && quota >= 0 && quota <= 100000)) {
    return "Kuota pertemuan harus berupa bilangan bulat 0 sampai 100.000.";
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function courses(value: unknown): value is StudyGroupCourse[] {
  return Array.isArray(value) && value.every((entry) => object(entry) && typeof entry.id === "string" && typeof entry.title === "string");
}

export function isEnrollmentTokenDetails(value: unknown): value is EnrollmentTokenDetails {
  return object(value) && typeof value.id === "string" && typeof value.revision === "string" && /^[a-f0-9]{64}$/.test(value.revision)
    && (value.status === "active" || value.status === "expired") && typeof value.expiresAt === "string" && Number.isFinite(Date.parse(value.expiresAt))
    && typeof value.capacity === "number" && typeof value.used === "number" && courses(value.courses);
}

export function isEnrollmentTokenEditor(value: unknown): value is EnrollmentTokenEditor {
  return object(value) && ((value.type === "issue" && courses(value.courses)) || (value.type === "token" && isEnrollmentTokenDetails(value.token)));
}
