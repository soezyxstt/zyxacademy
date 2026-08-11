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

import { format, subDays, subWeeks, startOfDay as fnsStartOfDay, startOfWeek as fnsStartOfWeek } from "date-fns";

/* ────────────────────────────────────────────────────────────────────────────
 * SQLite integer → Date adapter
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Normalizes a value that may be a SQLite epoch-second integer into a JS Date.
 *
 * Drizzle with `{ mode: "timestamp" }` stores seconds in SQLite. If a raw
 * integer leaks through (e.g. from a raw `sql` query), `new Date(1700000000)`
 * would be interpreted as milliseconds → year 1970, which is fine, but if the
 * value was accidentally pre-multiplied by 1000, the year exceeds 3000.
 * This function detects that and divides by 1000 to recover the correct date.
 *
 * Safe to call on values that are already Date objects or ISO strings.
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

/**
 * Formats a Date as `yyyy-MM-dd` in local time.
 * Use for display labels, DB text columns that store date-only values, etc.
 */
export function formatIsoDate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/**
 * Formats a Date as `yyyy-MM-dd` in UTC.
 * Use for DB text columns that store UTC date strings (streaks, recommendations, etc.).
 */
export function formatIsoDateUtc(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Formats a Date as `yyyy-MM-dd'T'HH:mm` in local time.
 * Use for `<input type="datetime-local">` values and datetime-local form fields.
 *
 * Returns empty string for null/undefined/invalid input.
 */
export function formatDatetimeLocal(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return "";
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

/**
 * Converts a numeric DB timestamp (epoch seconds or milliseconds) to an ISO string.
 * Returns null for falsy, NaN, or zero values.
 */
export function toIsoTimestamp(val: unknown): string | null {
  const n = Number(val);
  if (!val || isNaN(n) || n === 0) return null;
  // If the number looks like seconds (year > 2100 when treated as ms), divide by 1000
  const ms = n > 1e12 ? n : n * 1000;
  return new Date(ms).toISOString();
}

/* ────────────────────────────────────────────────────────────────────────────
 * Date arithmetic
 * ──────────────────────────────────────────────────────────────────────────── */

/** Returns a Date set to the start of the given day (00:00:00.000) in local time. */
export function startOfDay(date: Date = new Date()): Date {
  return fnsStartOfDay(date);
}

/** Returns a Date set to the start of the given day (00:00:00.000) in UTC. */
export function startOfDayUtc(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Returns a Date that is `n` days before the given date (or today). */
export function daysAgo(n: number, from: Date = new Date()): Date {
  return subDays(from, n);
}

/** Returns a Date that is `n` weeks before the given date (or today). */
export function weeksAgo(n: number, from: Date = new Date()): Date {
  return subWeeks(from, n);
}

/**
 * Returns the Monday–Sunday range of the previous week relative to `now`.
 * Monday is start-of-day (00:00:00.000), Sunday is end-of-day (23:59:59.999).
 */
export function previousWeekRange(now: Date = new Date()): { monday: Date; sunday: Date } {
  // Start of this week (Monday) using date-fns (weekStartsOn: 1 = Monday)
  const thisMonday = fnsStartOfWeek(now, { weekStartsOn: 1 });
  // Previous week Monday
  const monday = subWeeks(thisMonday, 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}
