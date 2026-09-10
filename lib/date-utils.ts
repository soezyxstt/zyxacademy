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

import { addDays, format, subDays, subWeeks, startOfDay as fnsStartOfDay, startOfWeek as fnsStartOfWeek } from "date-fns";
import {
  addCalendarDays,
  assertCalendarDate,
  calendarDateToJakartaInstant,
  getCalendarDayIndex,
  getCalendarMonthLabel,
  getCalendarWeekRange,
  getJakartaCalendarDate,
  parseCalendarDate,
} from "@/lib/schedule/calendar-date";

/* ────────────────────────────────────────────────────────────────────────────
 * SQLite integer → Date adapter
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Normalizes a value that may be a SQLite epoch-second integer into a JS Date.
 */
export function normalizeDate(value: Date | string | number): Date {
  const d = new Date(value);
  if (isNaN(d.getTime())) return d;
  return d.getFullYear() > 3000 ? new Date(d.getTime() / 1000) : d;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Today / yesterday as UTC date strings (yyyy-MM-dd)
 * Used for DB text columns: streaks, recommendations, daily keys, etc.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Returns today's date as a `yyyy-MM-dd` string in UTC. */
export function todayUtc(): string {
  return format(new Date(), "yyyy-MM-dd");
}

const JAKARTA_TIME_ZONE = "Asia/Jakarta";

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
export function isSessionLocked(targetSessionDate: Date | string, customNow?: Date): boolean {
  const cutoff = getWeeklyLockCutoff(targetSessionDate);
  const now = customNow || new Date();
  return now.getTime() > cutoff.getTime();
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
