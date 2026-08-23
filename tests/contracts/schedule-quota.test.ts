import { describe, expect, test } from "bun:test";
import {
  computeWeeklySessionStats,
  isNinetyMinuteSlot,
  timeToMinutes,
  getIsoWeekRange,
} from "@/lib/schedule-lock";

describe("timeToMinutes", () => {
  test("parses valid HH:MM strings", () => {
    expect(timeToMinutes("09:00")).toBe(540);
    expect(timeToMinutes("10:30")).toBe(630);
    expect(timeToMinutes("23:59")).toBe(1439);
  });

  test("rejects invalid formats", () => {
    expect(timeToMinutes("9:0")).toBeNull();
    expect(timeToMinutes("24:00")).toBeNull();
    expect(timeToMinutes("abc")).toBeNull();
  });
});

describe("isNinetyMinuteSlot", () => {
  test("accepts exactly 90 minutes", () => {
    expect(isNinetyMinuteSlot("09:00", "10:30")).toBe(true);
    expect(isNinetyMinuteSlot("13:15", "14:45")).toBe(true);
  });

  test("rejects other durations", () => {
    expect(isNinetyMinuteSlot("09:00", "10:00")).toBe(false);
    expect(isNinetyMinuteSlot("09:00", "11:00")).toBe(false);
    expect(isNinetyMinuteSlot("bad", "10:30")).toBe(false);
  });
});

describe("getIsoWeekRange", () => {
  test("returns Monday to Sunday of the containing week", () => {
    // Wednesday, 19 August 2026
    const range = getIsoWeekRange("2026-08-19");
    expect(range.startIso).toBe("2026-08-17");
    expect(range.endIso).toBe("2026-08-23");
  });

  test("maps a Sunday into its own week", () => {
    const range = getIsoWeekRange("2026-08-23");
    expect(range.startIso).toBe("2026-08-17");
    expect(range.endIso).toBe("2026-08-23");
  });
});

describe("computeWeeklySessionStats", () => {
  const now = new Date(2026, 7, 20, 14, 0, 0); // Thursday, 20 Aug 2026, 14:00 WIB

  test("counts attended, missed, and cancelled per week", () => {
    const stats = computeWeeklySessionStats(
      [
        { sessionDate: "2026-08-18", startTime: "09:00", endTime: "10:30", status: "completed" },
        { sessionDate: "2026-08-19", startTime: "09:00", endTime: "10:30", status: "scheduled" },
        { sessionDate: "2026-08-11", startTime: "09:00", endTime: "10:30", status: "scheduled" },
        { sessionDate: "2026-08-12", startTime: "11:00", endTime: "12:00", status: "cancelled" },
      ],
      2,
      now
    );

    expect(stats).toHaveLength(2);

    const thisWeek = stats.find((s) => s.weekStartIso === "2026-08-17");
    expect(thisWeek?.booked).toBe(2);
    expect(thisWeek?.attended).toBe(1);
    // Session on Wed 09:00-10:30 with now at Thu 14:00 has passed
    expect(thisWeek?.missed).toBe(1);
    expect(thisWeek?.cancelled).toBe(0);

    const lastWeek = stats.find((s) => s.weekStartIso === "2026-08-10");
    expect(lastWeek?.booked).toBe(2);
    expect(lastWeek?.missed).toBe(1);
    expect(lastWeek?.cancelled).toBe(1);
  });

  test("treats a same-day session before now as missed and after now as not missed", () => {
    const stats = computeWeeklySessionStats(
      [
        { sessionDate: "2026-08-20", startTime: "08:00", endTime: "09:30", status: "scheduled" },
        { sessionDate: "2026-08-20", startTime: "19:00", endTime: "20:30", status: "scheduled" },
      ],
      1,
      now
    );

    expect(stats[0].booked).toBe(2);
    expect(stats[0].missed).toBe(1);
  });

  test("returns empty weeks with zero counts", () => {
    const stats = computeWeeklySessionStats([], 3, now);
    expect(stats).toHaveLength(3);
    expect(stats.every((s) => s.booked === 0 && s.attended === 0 && s.missed === 0)).toBe(true);
  });
});
