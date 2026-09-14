import { describe, expect, test } from "bun:test";
import {
  CUSTOM_MEETING_STEP,
  CUSTOM_MIN_MEETINGS,
  getCustomPlanPriceQuote,
  getPlanPriceQuote,
} from "@/lib/pricing-constants";

describe("custom plan price estimator", () => {
  test("uses the shared Essential components for a 15-meeting estimate", () => {
    const quote = getCustomPlanPriceQuote(15, 3, 3);
    const essential = getPlanPriceQuote("essential", 3, 3, "intro");

    expect(quote.afterDiscount).toBe(essential.price);
    expect(quote.beforeDiscount).toBe(Math.ceil(quote.afterDiscount * 5 / 3));
    expect(quote.discountAmount).toBe(quote.beforeDiscount - quote.afterDiscount);
    expect(quote.discountPercent).toBe(40);
  });

  test("scales the estimate when the meeting count increases by five", () => {
    const fiveMeetings = getCustomPlanPriceQuote(5, 3, 3);
    const tenMeetings = getCustomPlanPriceQuote(10, 3, 3);

    expect(fiveMeetings.afterDiscount).toBe(2_445_000);
    expect(tenMeetings.afterDiscount).toBeGreaterThan(fiveMeetings.afterDiscount);
    expect(tenMeetings.beforeDiscount).toBe(Math.ceil(tenMeetings.afterDiscount * 5 / 3));
  });

  test("rejects meeting counts below five or outside the five-meeting step", () => {
    expect(() => getCustomPlanPriceQuote(CUSTOM_MIN_MEETINGS - 1, 3, 3)).toThrow(RangeError);
    expect(() => getCustomPlanPriceQuote(CUSTOM_MIN_MEETINGS + 1, 3, 3)).toThrow(
      `Jumlah pertemuan harus kelipatan ${CUSTOM_MEETING_STEP}.`,
    );
  });

  test("rejects non-positive quantities", () => {
    expect(() => getCustomPlanPriceQuote(5, 0, 3)).toThrow(RangeError);
    expect(() => getCustomPlanPriceQuote(5, 3, 0)).toThrow(RangeError);
  });
});
