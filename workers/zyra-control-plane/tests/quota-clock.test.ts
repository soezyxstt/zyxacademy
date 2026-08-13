import { describe, expect, test } from "bun:test";
import {
  appDayLabel,
  nextProviderDayBoundaryMs,
  providerDayLabel,
  providerMinuteBucket
} from "../src/quota/clock";

describe("Plan 003 injected provider and application clocks", () => {
  test("uses Pacific day labels and preserves the DST transition", () => {
    expect(providerDayLabel(new Date("2026-08-05T06:59:59.000Z"))).toBe("2026-08-04");
    expect(providerDayLabel(new Date("2026-08-05T07:00:00.000Z"))).toBe("2026-08-05");
    expect(providerDayLabel(new Date("2026-03-08T09:59:59.000Z"))).toBe("2026-03-08");
    expect(providerDayLabel(new Date("2026-03-08T10:00:00.000Z"))).toBe("2026-03-08");
  });

  test("uses Jakarta midnight independently of provider midnight", () => {
    expect(appDayLabel(new Date("2026-08-04T16:59:59.000Z"))).toBe("2026-08-04");
    expect(appDayLabel(new Date("2026-08-04T17:00:00.000Z"))).toBe("2026-08-05");
  });

  test("produces a stable provider minute bucket and next boundary", () => {
    const value = new Date("2026-08-05T06:59:30.000Z");
    expect(providerMinuteBucket(value)).toBe("2026-08-04T23:59");
    expect(nextProviderDayBoundaryMs(value)).toBe(Date.parse("2026-08-05T07:00:30.000Z"));
  });
});
