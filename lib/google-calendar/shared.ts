export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export function hasCalendarScope(scope: string | null) {
  return (scope ?? "").split(/[ ,]+/).includes(CALENDAR_SCOPE);
}
export type CalendarSyncStatus = {
  connected: boolean;
  configured: boolean;
  pending: boolean;
  lastSyncedAt: string | null;
  error: "reconnect" | "failed" | null;
};
