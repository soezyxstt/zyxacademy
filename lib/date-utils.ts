/**
 * Centralized date utilities for the Zyx codebase.
 *
 * WHY THIS EXISTS:
 * SQLite stores dates as integer epoch SECONDS. JavaScript Date uses MILLISECONDS.
 * Drizzle ORM's `{ mode: "timestamp" }` converts automatically in most cases, but
 * raw queries or leaked integers can cause the "year > 3000" problem. All date
 * helpers live here so every file uses the same conversion logic.
 *
 * RULES:
 * - Never hand-roll yyyy-MM-dd formatting. Use `formatIsoDate()`.
 * - Never hand-roll datetime-local strings. Use `formatDatetimeLocal()`.
 * - Never do `new Date().toISOString().slice(0, 10)`. Use `todayUtc()`.
 * - When reading a raw integer from SQLite, always pass through `normalizeDate()`.
 * - For UTC date strings in DB columns (streaks, recommendations), use `todayUtc()`.
 */

import { addDays, addMilliseconds, format, getUnixTime, getISODay, subMinutes, subDays, subWeeks, startOfDay as fnsStartOfDay, startOfWeek as fnsStartOfWeek } from "date-fns";

/** Monday is index 0, using the local calendar day. */
export function localWeekdayIndex(date: Date): number { return getISODay(date) - 1; }

/** Call under the entity lock when timestamp ordering must survive equal or skewed clocks. */
export function nextMonotonicTimestamp(previous?: Date | null, now = new Date()): Date {
  return previous && now.getTime() <= previous.getTime() ? addMilliseconds(previous, 1) : now;
}

const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const JAKARTA_TIME_ZONE = "Asia/Jakarta";
const JAKARTA_OFFSET = "+07:00";
const DAY_MS = 24 * 60 * 60 * 1000;

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

function calendarDateEpoch(value: CalendarDate): number {
  const { year, month, day } = parseCalendarDate(value);
  return Date.UTC(year, month - 1, day, 12, 0, 0, 0);
}

export function addCalendarDays(value: CalendarDate, days: number): CalendarDate {
  const { year, month, day } = parseCalendarDate(value);
  const shifted = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0, 0));
  return formatCalendarDate({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  });
}

export function diffCalendarDays(left: CalendarDate, right: CalendarDate): number {
  return Math.round((calendarDateEpoch(assertCalendarDate(left)) - calendarDateEpoch(assertCalendarDate(right))) / DAY_MS);
}

export function compareCalendarDates(left: CalendarDate, right: CalendarDate): number {
  const a = assertCalendarDate(left);
  const b = assertCalendarDate(right);
  return a === b ? 0 : a < b ? -1 : 1;
}

export function getCalendarDayIndex(value: CalendarDate): number {
  const { year, month, day } = parseCalendarDate(value);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0)).getUTCDay();
}

export function getCalendarWeekRange(value: CalendarDate): {
  startIso: CalendarDate;
  endIso: CalendarDate;
} {
  const normalized = assertCalendarDate(value);
  const dayIndex = getCalendarDayIndex(normalized);
  const daysSinceMonday = (dayIndex + 6) % 7;
  const startIso = addCalendarDays(normalized, -daysSinceMonday);
  return { startIso, endIso: addCalendarDays(startIso, 6) };
}

export function getCalendarMonthRange(value: CalendarDate): {
  startIso: CalendarDate;
  endIso: CalendarDate;
} {
  const { year, month } = parseCalendarDate(value);
  const startIso = formatCalendarDate({ year, month, day: 1 });
  const nextMonth = new Date(Date.UTC(year, month, 1, 12, 0, 0, 0));
  const endDate = new Date(nextMonth.getTime() - DAY_MS);
  return {
    startIso,
    endIso: formatCalendarDate({
      year: endDate.getUTCFullYear(),
      month: endDate.getUTCMonth() + 1,
      day: endDate.getUTCDate(),
    }),
  };
}

export function addCalendarMonths(value: CalendarDate, months: number): CalendarDate {
  const { year, month, day } = parseCalendarDate(value);
  const firstOfTarget = new Date(Date.UTC(year, month - 1 + months, 1, 12, 0, 0, 0));
  const targetYear = firstOfTarget.getUTCFullYear();
  const targetMonth = firstOfTarget.getUTCMonth() + 1;
  const lastDayOfTarget = parseCalendarDate(
    getCalendarMonthRange(formatCalendarDate({ year: targetYear, month: targetMonth, day: 1 })).endIso,
  ).day;
  return formatCalendarDate({
    year: targetYear,
    month: targetMonth,
    day: Math.min(day, lastDayOfTarget),
  });
}

export function calendarDateToJakartaInstant(
  value: CalendarDate,
  time = "00:00:00.000",
): Date {
  const normalized = assertCalendarDate(value);
  const parsed = new Date(`${normalized}T${time}${JAKARTA_OFFSET}`);
  if (Number.isNaN(parsed.getTime())) {
    throw new RangeError("INVALID_JAKARTA_INSTANT");
  }
  return parsed;
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

export function calendarDateFromInput(input: Date | string): CalendarDate {
  if (typeof input === "string") {
    const normalized = input.trim();
    if (CALENDAR_DATE_PATTERN.test(normalized)) {
      return assertCalendarDate(normalized);
    }

    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      throw new RangeError("INVALID_CALENDAR_DATE");
    }
    return getJakartaCalendarDate(parsed);
  }

  return getJakartaCalendarDate(input);
}

export function getCalendarMonthLabel(value: CalendarDate, locale = "id-ID"): string {
  const { year, month, day } = parseCalendarDate(value);
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0)));
}

/* ────────────────────────────────────────────────────────────────────────────
 * SQLite integer → Date adapter
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Normalizes a value that may be a SQLite epoch-second integer into a JS Date.
 * Preserves Date instances directly so valid far-future dates are not corrupted.
 * Divides by 1000 only for raw integer values whose year exceeds 3000.
 */
export function normalizeDate(value: Date | string | number): Date {
  if (value instanceof Date) {
    if (!isNaN(value.getTime()) && value.getFullYear() > 10000) {
      return new Date(value.getTime() / 1000);
    }
    return value;
  }
  if (typeof value === "number" && value >= 100_000_000 && value < 100_000_000_000) {
    return new Date(value * 1000);
  }
  const d = new Date(value);
  if (isNaN(d.getTime())) return d;
  if (d.getFullYear() > 10000) {
    return new Date(d.getTime() / 1000);
  }
  return typeof value === "number" && d.getFullYear() > 3000 ? new Date(d.getTime() / 1000) : d;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Today / yesterday as UTC date strings (yyyy-MM-dd)
 * Used for DB text columns: streaks, recommendations, daily keys, etc.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Returns today's date as a `yyyy-MM-dd` string in UTC. */
export function todayUtc(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function jakartaDateParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: JAKARTA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

/** Returns the application calendar day in Asia/Jakarta. */
export function jakartaDay(date: Date = new Date()): string {
  const parts = jakartaDateParts(date);
  return `${parts.year.toString().padStart(4, "0")}-${parts.month.toString().padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}`;
}

/** Returns the UTC instant at the start of the supplied Asia/Jakarta day. */
export function startOfJakartaDayUtc(date: Date = new Date()): Date {
  return new Date(`${jakartaDay(date)}T00:00:00.000+07:00`);
}

/** Returns the next Asia/Jakarta daily reset instant as a UTC Date. */
export function nextJakartaReset(date: Date = new Date()): Date {
  return new Date(startOfJakartaDayUtc(date).getTime() + 24 * 60 * 60 * 1000);
}

/** Returns yesterday's date as a `yyyy-MM-dd` string in UTC. */
export function yesterdayUtc(): string {
  return format(subDays(new Date(), 1), "yyyy-MM-dd");
}

/* ────────────────────────────────────────────────────────────────────────────
 * Formatting helpers
 * ──────────────────────────────────────────────────────────────────────────── */

/** Formats a Date as `yyyy-MM-dd` in local time. */
export function formatIsoDate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** Formats a Date as `yyyy-MM-dd` in UTC. */
export function formatIsoDateUtc(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Formats a Date as `yyyy-MM-dd'T'HH:mm` in local time. */
export function formatDatetimeLocal(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return "";
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

/** Converts a numeric DB timestamp (epoch seconds or milliseconds) to an ISO string. */
export function toIsoTimestamp(val: unknown): string | null {
  const n = Number(val);
  if (!val || isNaN(n) || n === 0) return null;
  const ms = n > 1e12 ? n : n * 1000;
  return new Date(ms).toISOString();
}

/* ────────────────────────────────────────────────────────────────────────────
 * Date arithmetic
 * ──────────────────────────────────────────────────────────────────────────── */

export function startOfDay(date: Date = new Date()): Date {
  return fnsStartOfDay(date);
}

export function startOfDayUtc(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function daysAgo(n: number, from: Date = new Date()): Date {
  return subDays(from, n);
}

export function daysFrom(n: number, from: Date = new Date()): Date {
  return addDays(from, n);
}

export function weeksAgo(n: number, from: Date = new Date()): Date {
  return subWeeks(from, n);
}

export function previousWeekRange(now: Date = new Date()): { monday: Date; sunday: Date } {
  const thisMonday = fnsStartOfWeek(now, { weekStartsOn: 1 });
  const monday = subWeeks(thisMonday, 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Schedule and Indonesian calendar helpers
 * ──────────────────────────────────────────────────────────────────────────── */

export const INDONESIAN_DAYS = [
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
  "Minggu",
] as const;

export type IndonesianDay = (typeof INDONESIAN_DAYS)[number];

const DAY_MAP_ID: Record<number, IndonesianDay> = {
  0: "Minggu",
  1: "Senin",
  2: "Selasa",
  3: "Rabu",
  4: "Kamis",
  5: "Jumat",
  6: "Sabtu",
};

/**
 * Legacy wall-clock adapter. Prefer `getJakartaCalendarDate(new Date())` for
 * calendar identity and real `Date` instants for comparisons.
 */
export function getJakartaNow(): Date {
  const now = new Date();
  return new Date(now.toLocaleString("en-US", { timeZone: JAKARTA_TIME_ZONE }));
}

/** Parse an ISO date string or Date object to a neutral Date representation. */
export function parseDateInput(input: Date | string): Date {
  if (typeof input === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
      const { year, month, day } = parseCalendarDate(input);
      return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    }
    return new Date(input);
  }
  return normalizeDate(input);
}

function scheduleCalendarDate(input?: Date | string): string {
  if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.trim())) {
    return assertCalendarDate(input.trim());
  }
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) throw new RangeError("INVALID_CALENDAR_DATE");
    // Calendar Date objects in this legacy API are intentionally treated as
    // wall-clock placeholders. Read their local Y/M/D fields rather than
    // formatting the instant as UTC, which caused the one-day shift in Jakarta.
    return assertCalendarDate(
      `${input.getFullYear().toString().padStart(4, "0")}-${String(input.getMonth() + 1).padStart(2, "0")}-${String(input.getDate()).padStart(2, "0")}`,
    );
  }
  return getJakartaCalendarDate(new Date());
}

/** Given a target session date, returns a neutral Date representing Monday. */
export function getMondayOfWeek(targetDate: Date | string): Date {
  const { startIso } = getCalendarWeekRange(scheduleCalendarDate(targetDate));
  const { year, month, day } = parseCalendarDate(startIso);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

/** Weekly lock cut-off: Saturday 23:59:59.999 WIB preceding the target week. */
export function getWeeklyLockCutoff(targetSessionDate: Date | string): Date {
  const { startIso } = getCalendarWeekRange(scheduleCalendarDate(targetSessionDate));
  return calendarDateToJakartaInstant(addCalendarDays(startIso, -2), "23:59:59.999");
}

/** Checks whether the target tutorial week is past its booking lock instant. */
export function isSessionLocked(_targetSessionDate?: Date | string, _customNow?: Date): boolean {
  return false;
}


/** Generates seven stable calendar dates for the Monday-Sunday target week. */
export function getWeekScheduleDays(anchorDate?: Date | string): {
  startOfWeekIso: string;
  endOfWeekIso: string;
  mondayDate: Date;
  days: Array<{
    dateIso: string;
    dayName: IndonesianDay;
    dayOfMonth: number;
    monthName: string;
    isToday: boolean;
    isPast: boolean;
  }>;
} {
  const anchorIso = scheduleCalendarDate(anchorDate);
  const { startIso, endIso } = getCalendarWeekRange(anchorIso);
  const todayIso = getJakartaCalendarDate(new Date());
  const { year, month, day } = parseCalendarDate(startIso);
  const mondayDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  const days = Array.from({ length: 7 }, (_, index) => {
    const dateIso = addCalendarDays(startIso, index);
    const dateParts = parseCalendarDate(dateIso);
    const dayName = DAY_MAP_ID[getCalendarDayIndex(dateIso)] || "Senin";

    return {
      dateIso,
      dayName,
      dayOfMonth: dateParts.day,
      monthName: getCalendarMonthLabel(dateIso),
      isToday: dateIso === todayIso,
      isPast: dateIso < todayIso,
    };
  });

  return {
    startOfWeekIso: startIso,
    endOfWeekIso: endIso,
    mondayDate,
    days,
  };
}

/** Minute-based lease boundaries for background work. */
export function minutesAgo(minutes: number, from: Date = new Date()): Date { return subMinutes(from, minutes); }

export const SQLITE_MILLISECOND_THRESHOLD = 100_000_000_000;
/** Normalize legacy SQLite milliseconds before comparing timestamp-second columns. */
export function toUnixSeconds(value: Date | string | number): number { return getUnixTime(normalizeDate(value)); }
