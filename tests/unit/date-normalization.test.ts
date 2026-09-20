import { describe, expect, test } from "bun:test";
import { normalizeDate } from "@/lib/date-utils";

describe("normalizeDate", () => {
  test("preserves valid far-future Date instances without dividing by 1000", () => {
    const farFuture = new Date("3500-01-01T00:00:00.000Z");
    const normalized = normalizeDate(farFuture);

    expect(normalized).toBe(farFuture);
    expect(normalized.getUTCFullYear()).toBe(3500);
  });

  test("preserves Date instances with year 9999", () => {
    const year9999 = new Date("9999-12-31T23:59:59.999Z");
    const normalized = normalizeDate(year9999);

    expect(normalized).toBe(year9999);
    expect(normalized.getUTCFullYear()).toBe(9999);
  });

  test("divides numeric values with year > 3000 by 1000 to recover SQLite epoch seconds bug", () => {
    // 1726800000000000 ms is year > 56000
    const rawNumber = 1726800000000000;
    const normalized = normalizeDate(rawNumber);

    expect(normalized.getFullYear()).toBeLessThan(3000);
    expect(normalized.getTime()).toBe(rawNumber / 1000);
  });

  test("handles normal Date instances and strings properly", () => {
    const normalDate = new Date("2026-09-20T12:00:00.000Z");
    const normalized = normalizeDate(normalDate);
    expect(normalized.getTime()).toBe(normalDate.getTime());

    const isoString = "2026-09-20T12:00:00.000Z";
    const fromString = normalizeDate(isoString);
    expect(fromString.toISOString()).toBe(isoString);
  });
});
