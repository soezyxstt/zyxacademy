export const academicEventTypes = ["official_exam", "tryout", "quiz", "general"] as const;
export type AcademicEventType = typeof academicEventTypes[number];
export type AcademicEventFields = {
  title: string; type: AcademicEventType; courseId: string | null; description: string | null;
  startDate: string; endDate: string | null; location: string | null;
};
export type AcademicEventView = AcademicEventFields & { revision: string };
export type AcademicEventCommand =
  | { action: "create"; fields: AcademicEventFields }
  | { action: "edit"; id: string; expectedRevision: string; fields: AcademicEventFields }
  | { action: "delete"; id: string; expectedRevision: string; confirmed: true };

export function isAcademicEventView(value: unknown): value is AcademicEventView {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  const instant = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v));
  return typeof row.title === "string" && academicEventTypes.some(type => type === row.type)
    && [row.courseId, row.description, row.location].every(v => v === null || typeof v === "string")
    && instant(row.startDate) && (row.endDate === null || instant(row.endDate))
    && typeof row.revision === "string" && /^[a-f0-9]{64}$/.test(row.revision);
}
