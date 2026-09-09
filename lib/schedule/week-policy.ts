import { formatIsoDateUtc, jakartaDay } from "@/lib/date-utils";

const JAKARTA_OFFSET = "+07:00";
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type TutorialDateInput = Date | string;

export type TutorialWeekPhase =
  | "before_open"
  | "availability_open"
  | "booking_open"
  | "locked";

export interface TutorialWeekRange {
  startIso: string;
  endIso: string;
  weekStartIso: string;
  weekEndIso: string;
  monday: Date;
  sunday: Date;
}

function invalidTutorialDate(): never {
  throw new RangeError("INVALID_TUTORIAL_DATE");
}

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function dateInputToIso(input: TutorialDateInput): string {
  if (typeof input === "string") {
    const value = input.trim();
    if (ISO_DATE_PATTERN.test(value)) {
      if (!isValidIsoDate(value)) invalidTutorialDate();
      return value;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) invalidTutorialDate();
    return jakartaDay(parsed);
  }

  if (!(input instanceof Date) || Number.isNaN(input.getTime())) {
    invalidTutorialDate();
  }

  return jakartaDay(input);
}

function shiftIsoDate(dateIso: string, days: number): string {
  const [year, month, day] = dateIso.split("-").map(Number);
  return formatIsoDateUtc(new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0, 0)));
}

/** Shifts a validated tutorial calendar date without changing its timezone semantics. */
export function addTutorialDays(dateIso: string, days: number): string {
  if (!isValidIsoDate(dateIso.trim())) invalidTutorialDate();
  return shiftIsoDate(dateIso.trim(), days);
}

function atJakarta(dateIso: string, time: "start" | "deadline" | "lock"): Date {
  const clock = {
    start: "00:00:00.000",
    deadline: "18:00:00.000",
    lock: "23:59:59.999",
  }[time];

  return new Date(`${dateIso}T${clock}${JAKARTA_OFFSET}`);
}

function targetWeekStartIso(targetDate: TutorialDateInput): string {
  const targetIso = dateInputToIso(targetDate);
  const targetNoonUtc = new Date(`${targetIso}T12:00:00.000Z`);
  const daysSinceMonday = (targetNoonUtc.getUTCDay() + 6) % 7;
  return shiftIsoDate(targetIso, -daysSinceMonday);
}

/**
 * Returns the Monday through Sunday range containing the target calendar day
 * in Asia/Jakarta.
 */
export function getTutorialWeekRange(targetDate: TutorialDateInput): TutorialWeekRange {
  const startIso = targetWeekStartIso(targetDate);
  const endIso = shiftIsoDate(startIso, 6);

  return {
    startIso,
    endIso,
    weekStartIso: startIso,
    weekEndIso: endIso,
    monday: atJakarta(startIso, "start"),
    sunday: atJakarta(endIso, "lock"),
  };
}

/** Availability enters the near-term window on the Monday before the target tutorial week. */
export function getAvailabilityOpenAt(targetDate: TutorialDateInput): Date {
  const { startIso } = getTutorialWeekRange(targetDate);
  return atJakarta(shiftIsoDate(startIso, -7), "start");
}

/** Tutor availability changes close on the Friday before the target week. */
export function getTutorAvailabilityDeadline(targetDate: TutorialDateInput): Date {
  const { startIso } = getTutorialWeekRange(targetDate);
  return atJakarta(shiftIsoDate(startIso, -3), "deadline");
}

/** Student booking closes at the end of the Saturday before the target week. */
export function getBookingLockAt(targetDate: TutorialDateInput): Date {
  const { startIso } = getTutorialWeekRange(targetDate);
  return atJakarta(shiftIsoDate(startIso, -2), "lock");
}

export function getTutorialWeekPhase(
  targetDate: TutorialDateInput,
  now: Date = new Date(),
): TutorialWeekPhase {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new RangeError("INVALID_NOW");
  }

  const openAt = getAvailabilityOpenAt(targetDate).getTime();
  const tutorDeadline = getTutorAvailabilityDeadline(targetDate).getTime();
  const bookingLock = getBookingLockAt(targetDate).getTime();
  const nowMs = now.getTime();

  if (nowMs < openAt) return "before_open";
  if (nowMs < tutorDeadline) return "availability_open";
  if (nowMs <= bookingLock) return "booking_open";
  return "locked";
}

/**
 * Tutors may publish availability for any future tutorial week. A target week
 * becomes immutable only when its own Friday 18:00 WIB availability deadline
 * passes. This keeps the UI and server policy aligned for weeks two or more
 * weeks ahead while preserving the near-term lock window.
 */
export function canTutorCreateAvailability(
  targetDate: TutorialDateInput,
  now: Date = new Date(),
): boolean {
  const phase = getTutorialWeekPhase(targetDate, now);
  return phase === "before_open" || phase === "availability_open";
}

export function canTutorDeleteAvailability(
  targetDate: TutorialDateInput,
  now: Date = new Date(),
): boolean {
  return canTutorCreateAvailability(targetDate, now);
}

export function canStudentBook(
  targetDate: TutorialDateInput,
  now: Date = new Date(),
): boolean {
  const phase = getTutorialWeekPhase(targetDate, now);
  return phase === "availability_open" || phase === "booking_open";
}

export function isTutorialWeekLocked(
  targetDate: TutorialDateInput,
  now: Date = new Date(),
): boolean {
  return getTutorialWeekPhase(targetDate, now) === "locked";
}
