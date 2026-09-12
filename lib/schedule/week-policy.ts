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
 * passes.
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
