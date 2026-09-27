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
    expect(fromIso.getUTCMonth()).toBe(7);
    expect(fromIso.getUTCDate()).toBe(24);

    const fromDate = parseDateInput(new Date(2026, 7, 24));
    expect(fromDate instanceof Date).toBe(true);
  });

  test("getMondayOfWeek returns a neutral Monday without changing calendar identity", () => {
    const mondayFromWed = getMondayOfWeek("2026-08-26");
    expect(mondayFromWed.toISOString()).toBe("2026-08-24T12:00:00.000Z");

    const mondayFromSun = getMondayOfWeek("2026-08-30");
    expect(mondayFromSun.toISOString()).toBe("2026-08-24T12:00:00.000Z");
  });

  test("getWeeklyLockCutoff returns Saturday 23:59:59.999 WIB preceding the target week", () => {
    const cutoff = getWeeklyLockCutoff("2026-08-24");
    expect(cutoff.toISOString()).toBe("2026-08-22T16:59:59.999Z");
  });

  test("isSessionLocked returns false since lock system is removed", () => {
    const sessionDate = "2026-08-24";
    const cutoff = getWeeklyLockCutoff(sessionDate);
    expect(isSessionLocked(sessionDate, new Date(cutoff.getTime() - 1))).toBe(false);
    expect(isSessionLocked(sessionDate, cutoff)).toBe(false);
    expect(isSessionLocked(sessionDate, new Date(cutoff.getTime() + 1))).toBe(false);
  });

  test("getWeekScheduleDays preserves Monday-Sunday date identity", () => {
    const result = getWeekScheduleDays("2026-08-24");
    expect(result.days).toHaveLength(7);
    expect(result.days[0].dayName).toBe("Senin");
    expect(result.days[0].dateIso).toBe("2026-08-24");
    expect(result.days[6].dayName).toBe("Minggu");
    expect(result.days[6].dateIso).toBe("2026-08-30");
    expect(result.startOfWeekIso).toBe("2026-08-24");
    expect(result.endOfWeekIso).toBe("2026-08-30");
  });

  test("14-20 September never shifts to 13-19 September", () => {
    const result = getWeekScheduleDays("2026-09-14");
    expect(result.startOfWeekIso).toBe("2026-09-14");
    expect(result.endOfWeekIso).toBe("2026-09-20");
    expect(result.days.map((day) => day.dateIso)).toEqual([
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
    ]);
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
