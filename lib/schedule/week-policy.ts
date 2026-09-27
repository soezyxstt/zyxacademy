import {
  addCalendarDays,
  calendarDateFromInput,
  calendarDateToJakartaInstant,
  getCalendarWeekRange,
} from "@/lib/schedule/calendar-date";

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

function targetWeekStartIso(targetDate: TutorialDateInput): string {
  return getCalendarWeekRange(calendarDateFromInput(targetDate)).startIso;
}

/** Shifts a validated tutorial calendar date without changing its timezone semantics. */
export function addTutorialDays(dateIso: string, days: number): string {
  return addCalendarDays(calendarDateFromInput(dateIso), days);
}

/**
 * Returns the Monday through Sunday range containing the target calendar day
 * in Asia/Jakarta. Calendar identity is date-only and therefore does not depend
 * on the host/browser timezone.
 */
export function getTutorialWeekRange(targetDate: TutorialDateInput): TutorialWeekRange {
  const { startIso, endIso } = getCalendarWeekRange(calendarDateFromInput(targetDate));

  return {
    startIso,
    endIso,
    weekStartIso: startIso,
    weekEndIso: endIso,
    monday: calendarDateToJakartaInstant(startIso),
    sunday: calendarDateToJakartaInstant(endIso, "23:59:59.999"),
  };
}

/** Availability enters the near-term window on the Monday before the target tutorial week. */
export function getAvailabilityOpenAt(targetDate: TutorialDateInput): Date {
  const { startIso } = getTutorialWeekRange(targetDate);
  return calendarDateToJakartaInstant(addCalendarDays(startIso, -7));
}

/** Tutor availability changes close on the Friday before the target week. */
export function getTutorAvailabilityDeadline(targetDate: TutorialDateInput): Date {
  const { startIso } = getTutorialWeekRange(targetDate);
  return calendarDateToJakartaInstant(addCalendarDays(startIso, -3), "18:00:00.000");
}

/** Student booking closes at the end of the Saturday before the target week. */
export function getBookingLockAt(targetDate: TutorialDateInput): Date {
  const { startIso } = getTutorialWeekRange(targetDate);
  return calendarDateToJakartaInstant(addCalendarDays(startIso, -2), "23:59:59.999");
}

export function getTutorialWeekPhase(
  _targetDate: TutorialDateInput,
  now: Date = new Date(),
): TutorialWeekPhase {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new RangeError("INVALID_NOW");
  }

  return "booking_open";
}

/**
 * Tutors may publish availability at any time without locking restrictions.
 */
export function canTutorCreateAvailability(
  _targetDate?: TutorialDateInput,
  _now: Date = new Date(),
): boolean {
  return true;
}

export function canTutorDeleteAvailability(
  _targetDate?: TutorialDateInput,
  _now: Date = new Date(),
): boolean {
  return true;
}

export function canStudentBook(
  _targetDate?: TutorialDateInput,
  _now: Date = new Date(),
): boolean {
  return true;
}

export function isTutorialWeekLocked(
  _targetDate?: TutorialDateInput,
  _now: Date = new Date(),
): boolean {
  return false;
}

