import { describe, expect, it } from "bun:test";
import { formatJakartaDatetimeLocal, parseJakartaDatetimeLocal } from "@/lib/date-utils";
import { isCourseFreeNow, parseCoursePricingInput, validateCoursePricing } from "@/lib/student/course-pricing";

describe("course pricing policy", () => {
  const startsAt = parseJakartaDatetimeLocal("2026-12-01T08:30");
  const endsAt = parseJakartaDatetimeLocal("2026-12-02T08:30");
  const limited = { category: "limited_time_free" as const, startsAt, endsAt };

  it("interprets admin wall time in Jakarta", () => {
    expect(startsAt.toISOString()).toBe("2026-12-01T01:30:00.000Z");
    expect(formatJakartaDatetimeLocal(startsAt)).toBe("2026-12-01T08:30");
    for (const value of ["", "2026-02-30T08:30", "2026-12-01T24:00", "2026-12-01T08:60", "2026-12-01T08:30Z"]) {
      expect(() => parseJakartaDatetimeLocal(value)).toThrow();
    }
  });

  it("includes the start and excludes the end", () => {
    expect(isCourseFreeNow(limited, new Date(startsAt.getTime() - 1))).toBe(false);
    expect(isCourseFreeNow(limited, startsAt)).toBe(true);
    expect(isCourseFreeNow(limited, new Date(endsAt.getTime() - 1))).toBe(true);
    expect(isCourseFreeNow(limited, endsAt)).toBe(false);
    expect(isCourseFreeNow(limited, new Date(NaN))).toBe(false);
  });

  it("rejects incomplete or reversed schedules and clears stale bounds", () => {
    expect(() => validateCoursePricing({ ...limited, startsAt: null })).toThrow();
    expect(() => validateCoursePricing({ ...limited, endsAt: new Date(NaN) })).toThrow();
    expect(() => validateCoursePricing({ ...limited, endsAt: startsAt })).toThrow();
    expect(() => validateCoursePricing({ ...limited, startsAt: endsAt, endsAt: startsAt })).toThrow();
    expect(() => validateCoursePricing({ ...limited, category: "other" as never })).toThrow();
    expect(validateCoursePricing({ ...limited, category: "premium" })).toEqual({ category: "premium", startsAt: null, endsAt: null });
    expect(validateCoursePricing({ ...limited, category: "free" })).toEqual({ category: "free", startsAt: null, endsAt: null });
    expect(isCourseFreeNow({ ...limited, category: "free" }, startsAt)).toBe(true);
    expect(isCourseFreeNow({ ...limited, category: "premium" }, startsAt)).toBe(false);
  });
  it("validates serialized action input and rejects malformed or ambiguous dates", () => {
    expect(parseCoursePricingInput({ category: "limited_time_free", startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() })).toEqual(limited);
    expect(parseCoursePricingInput({ ...limited, category: "free" })).toEqual({ category: "free", startsAt: null, endsAt: null });
    for (const value of [null, {}, { ...limited, category: "invalid" }, { ...limited, startsAt: "2026-12-01T08:30" }, { ...limited, startsAt: 123 }, { ...limited, endsAt: startsAt }]) {
      expect(() => parseCoursePricingInput(value)).toThrow();
    }
  });
});
