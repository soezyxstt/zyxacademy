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
