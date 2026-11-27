/** Account-wide quiet hours in the selected time zone. */
export type QuietHours = { enabled: boolean; startMinute: number; endMinute: number; timeZone: string };

export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function isMinuteOfDay(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 1440;
}

export function parseQuietHours(value: unknown): QuietHours | null {
  if (!value || typeof value !== "object") return null;
  const { enabled, startMinute, endMinute, timeZone } = value as Partial<QuietHours>;
  if (typeof enabled !== "boolean" || !isMinuteOfDay(startMinute) || !isMinuteOfDay(endMinute)
    || startMinute === endMinute || typeof timeZone !== "string" || !timeZone || timeZone.length > 100 || !isTimeZone(timeZone)) return null;
  return { enabled, startMinute, endMinute, timeZone };
}
