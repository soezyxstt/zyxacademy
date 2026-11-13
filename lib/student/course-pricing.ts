export type CoursePricingCategory = "premium" | "free" | "limited_time_free";

export type CoursePricing = {
  category: CoursePricingCategory;
  startsAt: Date | null;
  endsAt: Date | null;
};

export const PREMIUM_PRICING: CoursePricing = { category: "premium", startsAt: null, endsAt: null };

/** Reject malformed schedules at the write boundary and clear irrelevant bounds. */
export function validateCoursePricing(input: CoursePricing): CoursePricing {
  if (input.category !== "premium" && input.category !== "free" && input.category !== "limited_time_free") {
    throw new RangeError("INVALID_COURSE_PRICING_CATEGORY");
  }
  if (input.category !== "limited_time_free") {
    return { category: input.category, startsAt: null, endsAt: null };
  }
  if (!(input.startsAt instanceof Date) || !(input.endsAt instanceof Date)
    || !Number.isFinite(input.startsAt.getTime()) || !Number.isFinite(input.endsAt.getTime())
    || input.startsAt.getTime() >= input.endsAt.getTime()) {
    throw new RangeError("INVALID_COURSE_PRICING_SCHEDULE");
  }
  return input;
}

/** Accept only serialized instants or Date objects at the server action boundary. */
export function parseCoursePricingInput(value: unknown): CoursePricing {
  if (!value || typeof value !== "object") throw new RangeError("INVALID_COURSE_PRICING");
  const input = value as Record<string, unknown>;
  const toDate = (raw: unknown) => raw instanceof Date ? raw : typeof raw === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(raw) ? new Date(raw) : null;
  return validateCoursePricing({ category: input.category as CoursePricingCategory, startsAt: toDate(input.startsAt), endsAt: toDate(input.endsAt) });
}

/** Invalid stored schedules fail closed. The end instant is excluded. */
export function isCourseFreeNow(pricing: CoursePricing, now: Date): boolean {
  if (!Number.isFinite(now.getTime())) return false;
  if (pricing.category === "free") return true;
  return pricing.category === "limited_time_free"
    && pricing.startsAt instanceof Date && pricing.endsAt instanceof Date
    && Number.isFinite(pricing.startsAt.getTime()) && Number.isFinite(pricing.endsAt.getTime())
    && pricing.startsAt.getTime() <= now.getTime() && now.getTime() < pricing.endsAt.getTime();
}
