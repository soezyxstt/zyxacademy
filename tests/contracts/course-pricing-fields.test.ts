import { describe, expect, it } from "bun:test";
import { pricingFields, pricingFromFields } from "@/components/admin/course-pricing-fields";

describe("admin course pricing fields", () => {
  it("round-trips Jakarta wall times and rejects a reversed window", () => {
    const value = { category: "limited_time_free" as const, start: "2026-12-01T08:30", end: "2026-12-02T08:30" };
    const pricing = pricingFromFields(value);
    expect(pricing.startsAt?.toISOString()).toBe("2026-12-01T01:30:00.000Z");
    expect(pricingFields(pricing)).toEqual(value);
    expect(() => pricingFromFields({ ...value, end: value.start })).toThrow();
    expect(() => pricingFromFields({ ...value, start: "" })).toThrow();
    expect(pricingFromFields({ ...value, category: "premium" })).toEqual({ category: "premium", startsAt: null, endsAt: null });
  });
});
