export const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
export const JAKARTA_TIME_ZONE = "Asia/Jakarta";

export type CalendarDate = string;

export type CalendarDateParts = {
  year: number;
  month: number;
  day: number;
};

export function isCalendarDate(value: string): boolean {
  const match = CALENDAR_DATE_PATTERN.exec(value.trim());
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function assertCalendarDate(value: string): CalendarDate {
  const normalized = value.trim();
  if (!isCalendarDate(normalized)) {
    throw new RangeError("INVALID_CALENDAR_DATE");
  }
  return normalized;
}

export function parseCalendarDate(value: string): CalendarDateParts {
  const normalized = assertCalendarDate(value);
  const [year, month, day] = normalized.split("-").map(Number);
  return { year, month, day };
}

export function formatCalendarDate(parts: CalendarDateParts): CalendarDate {
  const candidate = `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  return assertCalendarDate(candidate);
}

export function getJakartaCalendarDate(date: Date = new Date()): CalendarDate {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new RangeError("INVALID_INSTANT");
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: JAKARTA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return formatCalendarDate({
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  });
}
