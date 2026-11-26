export type PkaScheduleFields = { title: string; sessionAt: string; meetLink: string | null };
export type PkaScheduleRevision = PkaScheduleFields & { revision: string };
export type PkaScheduleEdit = PkaScheduleFields & { expectedRevision: string };

export function isValidPkaScheduleText(value: string) {
  return value.trim().length > 0 && !value.includes("\u0000");
}

export function rebasePkaScheduleFields(base: PkaScheduleFields, draft: PkaScheduleFields, latest: PkaScheduleFields): PkaScheduleFields {
  return {
    title: draft.title === base.title.trim() ? latest.title : draft.title,
    sessionAt: Date.parse(draft.sessionAt) === Date.parse(base.sessionAt) ? latest.sessionAt : draft.sessionAt,
    meetLink: draft.meetLink === (base.meetLink?.trim() || null) ? latest.meetLink : draft.meetLink,
  };
}

export function isPkaScheduleRevision(value: unknown): value is PkaScheduleRevision {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.title === "string" && typeof row.sessionAt === "string" && Number.isFinite(Date.parse(row.sessionAt))
    && (row.meetLink === null || typeof row.meetLink === "string")
    && typeof row.revision === "string" && /^[a-f0-9]{64}$/.test(row.revision);
}
