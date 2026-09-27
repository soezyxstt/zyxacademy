import { describe, expect, it } from "bun:test";
import {
  canStudentBook,
  canTutorCreateAvailability,
  canTutorDeleteAvailability,
  getAvailabilityOpenAt,
  getBookingLockAt,
  getTutorialWeekPhase,
  getTutorialWeekRange,
  getTutorAvailabilityDeadline,
  isTutorialWeekLocked,
} from "@/lib/schedule/week-policy";

const targetWeek = "2026-08-26";
const beforeOpen = new Date("2026-08-16T23:59:59.999+07:00");
const openingInstant = new Date("2026-08-17T00:00:00.000+07:00");
const fridayBeforeDeadline = new Date("2026-08-21T17:59:59.999+07:00");
const deadlineInstant = new Date("2026-08-21T18:00:00.000+07:00");
const fridayNight = new Date("2026-08-21T23:00:00.000+07:00");
const saturdayBeforeLock = new Date("2026-08-22T23:59:59.998+07:00");
const lockInstant = new Date("2026-08-22T23:59:59.999+07:00");
const afterLock = new Date("2026-08-23T00:00:00.000+07:00");

describe("Tutorial week policy", () => {
  it("derives a Monday to Sunday Jakarta week and exact lifecycle instants", () => {
    const range = getTutorialWeekRange(targetWeek);

    expect(range.startIso).toBe("2026-08-24");
    expect(range.endIso).toBe("2026-08-30");
    expect(range.monday.toISOString()).toBe("2026-08-23T17:00:00.000Z");
    expect(range.sunday.toISOString()).toBe("2026-08-30T16:59:59.999Z");
    expect(getAvailabilityOpenAt(targetWeek).toISOString()).toBe("2026-08-16T17:00:00.000Z");
    expect(getTutorAvailabilityDeadline(targetWeek).toISOString()).toBe("2026-08-21T11:00:00.000Z");
    expect(getBookingLockAt(targetWeek).toISOString()).toBe("2026-08-22T16:59:59.999Z");
  });

  it("lets tutors publish and delete availability without deadline lock", () => {
    expect(canTutorCreateAvailability(targetWeek, beforeOpen)).toBe(true);
    expect(canTutorDeleteAvailability(targetWeek, beforeOpen)).toBe(true);
    expect(canTutorCreateAvailability(targetWeek, openingInstant)).toBe(true);
    expect(canTutorDeleteAvailability(targetWeek, openingInstant)).toBe(true);
    expect(canTutorCreateAvailability(targetWeek, fridayBeforeDeadline)).toBe(true);
    expect(canTutorDeleteAvailability(targetWeek, fridayBeforeDeadline)).toBe(true);
    expect(canTutorCreateAvailability(targetWeek, deadlineInstant)).toBe(true);
    expect(canTutorDeleteAvailability(targetWeek, deadlineInstant)).toBe(true);
    expect(canStudentBook(targetWeek, fridayNight)).toBe(true);
    expect(canStudentBook(targetWeek, saturdayBeforeLock)).toBe(true);
    expect(canStudentBook(targetWeek, lockInstant)).toBe(true);
    expect(isTutorialWeekLocked(targetWeek, afterLock)).toBe(false);
    expect(canStudentBook(targetWeek, afterLock)).toBe(true);
  });

  it("keeps 14-20 September editable and bookable on Thursday 10 September", () => {
    const now = new Date("2026-09-10T00:17:00.000+07:00");

    expect(canTutorCreateAvailability("2026-09-14", now)).toBe(true);
    expect(canStudentBook("2026-09-14", now)).toBe(true);
    expect(isTutorialWeekLocked("2026-09-14", now)).toBe(false);
  });

  it("allows availability and booking for 21 September without locking", () => {
    const now = new Date("2026-09-10T00:17:00.000+07:00");

    expect(canTutorCreateAvailability("2026-09-21", now)).toBe(true);
    expect(canStudentBook("2026-09-21", now)).toBe(true);
    expect(isTutorialWeekLocked("2026-09-21", now)).toBe(false);
  });

  it("never locks 14-20 September even after Saturday 12 September ends", () => {
    const beforeLock = new Date("2026-09-12T23:59:59.998+07:00");
    const afterLock = new Date("2026-09-13T00:00:00.000+07:00");

    expect(isTutorialWeekLocked("2026-09-14", beforeLock)).toBe(false);
    expect(isTutorialWeekLocked("2026-09-14", afterLock)).toBe(false);
  });
});
