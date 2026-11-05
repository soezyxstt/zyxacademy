import { expect, test } from "bun:test";
import { DEFAULT_PRICING_DISCOUNTS, getComponentPriceQuote, pricingDiscountsSchema } from "@/lib/pricing-discounts";
import { getCustomPlanPriceQuote, getPlanPriceQuote, getTutorFeeQuote, buildWhatsAppPlanUrl } from "@/lib/pricing-constants";

const settings = {
  platform: { percent: 20, startsOn: "2026-11-05", endsOn: "2026-11-05" },
  tutorial: { percent: 50, startsOn: "2026-11-06", endsOn: "2026-11-07" },
};

test("component discounts have independent inclusive Jakarta dates", () => {
  const quote = (instant: string) => getComponentPriceQuote(100_000, 200_000, settings, new Date(instant));
  expect(quote("2026-11-04T16:59:59Z").price).toBe(300_000);
  expect(quote("2026-11-04T17:00:00Z").price).toBe(280_000);
  expect(quote("2026-11-05T16:59:59Z").price).toBe(280_000);
  expect(quote("2026-11-05T17:00:00Z").price).toBe(200_000);
  expect(quote("2026-11-07T17:00:00Z").price).toBe(300_000);
});

test("0 and 100 percent are supported and invalid settings are rejected", () => {
  const free = { platform: { ...settings.platform, percent: 100 }, tutorial: { ...settings.platform, percent: 0 } };
  expect(getComponentPriceQuote(100, 200, free, new Date("2026-11-05T00:00:00Z")).price).toBe(200);
  for (const percent of [-1, 101, 1.5, NaN]) {
    expect(pricingDiscountsSchema.safeParse({ ...settings, platform: { ...settings.platform, percent } }).success).toBe(false);
  }
  expect(pricingDiscountsSchema.safeParse({ ...settings, platform: { ...settings.platform, endsOn: "2026-11-04" } }).success).toBe(false);
  expect(pricingDiscountsSchema.safeParse({ ...settings, platform: { ...settings.platform, startsOn: "2026-02-30" } }).success).toBe(false);
});

test("published plans, admin quotes, tutor pool and vouchers share the current price", () => {
  const now = new Date("2026-11-05T12:00:00+07:00");
  const plan = getPlanPriceQuote("essential", 3, 3, undefined, settings, now);
  const custom = getCustomPlanPriceQuote(15, 3, 3, 10, settings, now);
  const tutor = getTutorFeeQuote(15, 3, 3, undefined, settings, now);
  expect(custom.afterDiscount).toBe(plan.price);
  expect(custom.finalPrice).toBe(plan.price - Math.round(plan.price * .1));
  expect(tutor.introductory.packagePrice).toBe(plan.price);
  expect(tutor.introductory.tutorialPool).toBe(6_383_333);
  expect(getPlanPriceQuote("minimal", 3, 3, undefined, settings, now).price).toBeLessThan(getPlanPriceQuote("minimal", 3, 3, "regular").price);
  for (const plan of ["free", "custom"] as const) expect(getPlanPriceQuote(plan, 3, 3, undefined, settings, now).price).toBe(0);
});

test("expired default campaigns retain existing regular prices", () => {
  for (const plan of ["minimal", "essential", "premium"] as const) {
    for (const persons of [1, 3, 5]) {
      expect(getPlanPriceQuote(plan, persons, 3, undefined, DEFAULT_PRICING_DISCOUNTS, new Date("2026-11-05" )).price)
        .toBe(getPlanPriceQuote(plan, persons, 3, "regular").price);
    }
  }
  const url = decodeURIComponent(buildWhatsAppPlanUrl("628123456789", "essential", "Essential", 3, 3, [], undefined, DEFAULT_PRICING_DISCOUNTS));
  expect(url).not.toContain("31 Oktober");
});

test("WhatsApp uses the same saved component discounts as the public quote", () => {
  const active = {
    platform: { percent: 20, startsOn: "2000-01-01", endsOn: "2099-12-31" },
    tutorial: { percent: 50, startsOn: "2000-01-01", endsOn: "2099-12-31" },
  };
  const quote = getPlanPriceQuote("essential", 3, 3, undefined, active);
  const message = new URL(buildWhatsAppPlanUrl("628000000000", "essential", "Essential", 3, 3, [], undefined, active)).searchParams.get("text")!;
  expect(message).toContain(quote.price.toLocaleString("id-ID"));
  expect(message).toContain(quote.regularPrice.toLocaleString("id-ID"));
  expect(message).not.toContain("40%");
  expect(message).not.toContain("31 Oktober");
});
