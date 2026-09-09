const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeAdminWeekOffset(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(-520, Math.min(520, Math.trunc(parsed)));
}

export function normalizeAdminOverrideReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function isConcreteDateInRange(
  sessionDate: string | null | undefined,
  startIso: string,
  endIso: string,
): boolean {
  return Boolean(
    sessionDate &&
      ISO_DATE_PATTERN.test(sessionDate) &&
      sessionDate >= startIso &&
      sessionDate <= endIso,
  );
}
