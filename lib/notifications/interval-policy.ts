/**
 * lib/notifications/interval-policy.ts
 *
 * Pure date, timezone, tier, and window classification helpers for interval
 * notification jobs. Safe to import without database or runtime side effects.
 */

const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export function formatJakartaDateKey(now: Date): string {
  const shifted = new Date(now.getTime() + JAKARTA_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseJakartaSessionStart(sessionDate: string, startTime: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) return null;
  const match = /^(\d{2}):(\d{2})/.exec(startTime.trim());
  if (!match) return null;
  const iso = `${sessionDate}T${match[1]}:${match[2]}:00+07:00`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function classifyReengagementTier(inactiveDays: number): "none" | "nudge_3d" | "email_7d" {
  if (inactiveDays < 3 || inactiveDays > 30) return "none";
  if (inactiveDays >= 7) return "email_7d";
  return "nudge_3d";
}

export function classifyUpcomingSessionWindow(msUntilStart: number): "1h" | "24h" | null {
  if (msUntilStart >= 15 * 60_000 && msUntilStart <= 2 * HOUR_MS) return "1h";
  if (msUntilStart >= 18 * HOUR_MS && msUntilStart <= 28 * HOUR_MS) return "24h";
  return null;
}
