import { describe, expect, it } from "bun:test";
import {
  addCalendarDays,
  calendarDateFromInput,
  calendarDateToJakartaInstant,
  compareCalendarDates,
  getCalendarDayIndex,
  getCalendarWeekRange,
  getJakartaCalendarDate,
  isCalendarDate,
} from "@/lib/schedule/calendar-date";
import {
  getBookingLockAt,
  getTutorialWeekRange,
  isTutorialWeekLocked,
} from "@/lib/schedule/week-policy";

describe("schedule calendar-date domain", () => {
  it("keeps date-only identity stable across arithmetic", () => {
    expect(isCalendarDate("2026-09-14")).toBe(true);
    expect(isCalendarDate("2026-02-30")).toBe(false);
    expect(addCalendarDays("2026-09-14", 1)).toBe("2026-09-15");
    expect(addCalendarDays("2026-09-14", -1)).toBe("2026-09-13");
    expect(compareCalendarDates("2026-09-14", "2026-09-14")).toBe(0);
    expect(compareCalendarDates("2026-09-13", "2026-09-14")).toBe(-1);
  });

  it("derives Monday-Sunday without depending on host timezone", () => {
    expect(getCalendarDayIndex("2026-09-14")).toBe(1);
    expect(getCalendarWeekRange("2026-09-14")).toEqual({
      startIso: "2026-09-14",
      endIso: "2026-09-20",
    });
    expect(getCalendarWeekRange("2026-09-20")).toEqual({
      startIso: "2026-09-14",
      endIso: "2026-09-20",
    });
  });

  it("maps instants to the Jakarta calendar date explicitly", () => {
    expect(getJakartaCalendarDate(new Date("2026-09-13T17:00:00.000Z"))).toBe("2026-09-14");
    expect(getJakartaCalendarDate(new Date("2026-09-14T16:59:59.999Z"))).toBe("2026-09-14");
    expect(getJakartaCalendarDate(new Date("2026-09-14T17:00:00.000Z"))).toBe("2026-09-15");
    expect(calendarDateFromInput("2026-09-14")).toBe("2026-09-14");
  });

  it("converts calendar cutoffs to exact Jakarta instants", () => {
    expect(calendarDateToJakartaInstant("2026-09-14").toISOString()).toBe(
      "2026-09-13T17:00:00.000Z",
    );
    expect(getBookingLockAt("2026-09-14").toISOString()).toBe(
      "2026-09-12T16:59:59.999Z",
    );
  });

  it("never reclassifies 14-20 September as the previous week", () => {
    const week = getTutorialWeekRange("2026-09-14");
    expect(week.startIso).toBe("2026-09-14");
    expect(week.endIso).toBe("2026-09-20");

    const thursday = new Date("2026-09-10T10:18:00+07:00");
    expect(isTutorialWeekLocked("2026-09-14", thursday)).toBe(false);
  });
});
