/** Account-wide quiet hours, independent of the device's current time zone. */
import { z } from "zod";

export function isTimeZone(value: string): boolean {
 try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; } catch { return false; }
}
export const quietHoursSchema = z.object({
 enabled: z.boolean(),
 startMinute: z.number().int().min(0).max(1439),
 endMinute: z.number().int().min(0).max(1439),
 timeZone: z.string().min(1).max(100).refine(isTimeZone),
}).strict().refine(value => value.startMinute !== value.endMinute, { message: "Start and end must differ" });
export type QuietHours = z.infer<typeof quietHoursSchema>;
export const DEFAULT_QUIET_HOURS: QuietHours = { enabled: false, startMinute: 1320, endMinute: 420, timeZone: "Asia/Jakarta" };

function minuteOfDay(formatter: Intl.DateTimeFormat, date: Date) {
 const parts = formatter.formatToParts(date);
 return Number(parts.find(part => part.type === "hour")?.value) * 60 + Number(parts.find(part => part.type === "minute")?.value);
}
export function isQuietMinute(minute: number, start: number, end: number) {
 return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}
/** Return the first non-quiet minute, including overnight and DST transitions. */
export function quietHoursEnd(preferences: QuietHours, now = new Date()): Date | null {
 if (!preferences.enabled || preferences.startMinute === preferences.endMinute) return null;
 const format = new Intl.DateTimeFormat("en-GB", { timeZone: preferences.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
 if (!isQuietMinute(minuteOfDay(format, now), preferences.startMinute, preferences.endMinute)) return null;
 const minute = Math.floor(now.getTime() / 60_000) * 60_000;
 for (let i = 1; i <= 26 * 60; i++) {
  const candidate = new Date(minute + i * 60_000);
  if (!isQuietMinute(minuteOfDay(format, candidate), preferences.startMinute, preferences.endMinute)) return candidate;
 }
 throw new Error("QUIET_WINDOW_END_UNRESOLVED");
}
// /discussions is a role-aware redirect; the mounted workspaces use these paths.
function isDiscussionWorkspacePath(pathname: string): boolean {
 return /^(?:\/discussions|\/dashboard\/discussions|\/admin\/discussions|\/tutor\/discussions|\/courses\/[^/]+\/discussions|\/tutor\/[^/]+\/discussions)\/?$/.test(pathname);
}

export function notificationMatchesVisibleDiscussion(url: string | undefined, location: { pathname: string; search: string }, visible: boolean): boolean {
 if (!visible || !url?.startsWith("/") || !isDiscussionWorkspacePath(location.pathname)) return false;
 try {
  const base = "https://zyx.invalid";
  const incoming = new URL(url, base);
  if (incoming.origin !== base || !isDiscussionWorkspacePath(incoming.pathname)) return false;
  const current = new URLSearchParams(location.search);
  if (current.get("discussionTab") === "reports" || incoming.searchParams.get("discussionTab") === "reports") return false;
  const thread = incoming.searchParams.get("thread");
  return Boolean(thread && current.get("thread") === thread);
 } catch {
  return false;
 }
}
