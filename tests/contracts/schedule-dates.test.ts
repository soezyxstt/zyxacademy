import { describe, expect, test } from "bun:test";
import {
  INDONESIAN_DAYS,
  getJakartaNow,
  parseDateInput,
  getMondayOfWeek,
  getWeeklyLockCutoff,
  isSessionLocked,
  getWeekScheduleDays,
} from "@/lib/date-utils";
import * as scheduleLock from "@/lib/schedule-lock";

describe("Schedule Date Utilities Contract", () => {
  test("INDONESIAN_DAYS contains the 7 Indonesian day names in order", () => {
    expect(INDONESIAN_DAYS).toEqual([
      "Senin",
      "Selasa",
      "Rabu",
      "Kamis",
      "Jumat",
      "Sabtu",
      "Minggu",
    ]);
  });

  test("getJakartaNow returns a valid Date instance", () => {
    const now = getJakartaNow();
    expect(now instanceof Date).toBe(true);
    expect(isNaN(now.getTime())).toBe(false);
  });

  test("parseDateInput handles ISO date string, standard string, and Date object", () => {
    const fromIso = parseDateInput("2026-08-24");
    expect(fromIso.getUTCFullYear()).toBe(2026);
    expect(fromIso.getUTCMonth()).toBe(7); // August is month 7 (0-indexed)
    expect(fromIso.getUTCDate()).toBe(24);

    const fromDate = parseDateInput(new Date(2026, 7, 24));
    expect(fromDate.getFullYear()).toBe(2026);
  });

  test("getMondayOfWeek correctly determines the Monday of the given week", () => {
    // 2026-08-26 is a Wednesday. Monday should be 2026-08-24.
    const wednesday = new Date(2026, 7, 26, 10, 0, 0);
    const mondayFromWed = getMondayOfWeek(wednesday);
    expect(mondayFromWed.getDate()).toBe(24);
    expect(mondayFromWed.getDay()).toBe(1); // 1 = Monday

    // 2026-08-30 is a Sunday. Monday should be 2026-08-24.
    const sunday = new Date(2026, 7, 30, 10, 0, 0);
    const mondayFromSun = getMondayOfWeek(sunday);
    expect(mondayFromSun.getDate()).toBe(24);
    expect(mondayFromSun.getDay()).toBe(1);
  });

  test("getWeeklyLockCutoff returns Saturday 23:59:59 preceding the target session week", () => {
    // For week starting Monday 2026-08-24, cutoff is Saturday 2026-08-22 23:59:59.999
    const cutoff = getWeeklyLockCutoff("2026-08-24");
    expect(cutoff.getDay()).toBe(6); // Saturday
    expect(cutoff.getHours()).toBe(23);
    expect(cutoff.getMinutes()).toBe(59);
    expect(cutoff.getSeconds()).toBe(59);
    expect(cutoff.getMilliseconds()).toBe(999);
  });

  test("isSessionLocked verifies cutoff correctly", () => {
    const sessionDate = "2026-08-24";
    const cutoff = getWeeklyLockCutoff(sessionDate);

    // 1 hour before cutoff -> not locked
    const beforeCutoff = new Date(cutoff.getTime() - 3600000);
    expect(isSessionLocked(sessionDate, beforeCutoff)).toBe(false);

    // 1 hour after cutoff -> locked
    const afterCutoff = new Date(cutoff.getTime() + 3600000);
    expect(isSessionLocked(sessionDate, afterCutoff)).toBe(true);
  });

  test("getWeekScheduleDays returns 7 days starting from Monday", () => {
    const result = getWeekScheduleDays("2026-08-24");
    expect(result.days).toHaveLength(7);
    expect(result.days[0].dayName).toBe("Senin");
    expect(result.days[6].dayName).toBe("Minggu");
    expect(result.startOfWeekIso).toBe("2026-08-24");
    expect(result.endOfWeekIso).toBe("2026-08-30");
  });

  test("schedule-lock re-exports match date-utils exports", () => {
    expect(scheduleLock.INDONESIAN_DAYS).toBe(INDONESIAN_DAYS);
    expect(scheduleLock.getJakartaNow).toBe(getJakartaNow);
    expect(scheduleLock.parseDateInput).toBe(parseDateInput);
    expect(scheduleLock.getMondayOfWeek).toBe(getMondayOfWeek);
    expect(scheduleLock.getWeeklyLockCutoff).toBe(getWeeklyLockCutoff);
    expect(scheduleLock.isSessionLocked).toBe(isSessionLocked);
    expect(scheduleLock.getWeekScheduleDays).toBe(getWeekScheduleDays);
  });
});
