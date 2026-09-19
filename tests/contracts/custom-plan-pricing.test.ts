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
    expect(quote.beforeDiscountPerPerson).toBe(Math.round(quote.beforeDiscount / 3));
    expect(quote.afterDiscountPerPerson).toBe(Math.round(quote.afterDiscount / 3));
    expect(quote.discountAmount).toBe(quote.beforeDiscount - quote.afterDiscount);
    expect(quote.discountAmountPerPerson).toBe(quote.beforeDiscountPerPerson - quote.afterDiscountPerPerson);
    expect(quote.discountPercent).toBe(40);
  });

  test("scales the estimate when the meeting count increases by five", () => {
    const fiveMeetings = getCustomPlanPriceQuote(5, 3, 3);
    const tenMeetings = getCustomPlanPriceQuote(10, 3, 3);

    expect(fiveMeetings.afterDiscount).toBe(2_445_000);
    expect(tenMeetings.afterDiscount).toBeGreaterThan(fiveMeetings.afterDiscount);
    expect(tenMeetings.beforeDiscount).toBe(Math.ceil(tenMeetings.afterDiscount * 5 / 3));
  });

  test("calculates the per-person estimate from the selected group size", () => {
    const quote = getCustomPlanPriceQuote(10, 4, 2);

    expect(quote.beforeDiscountPerPerson).toBe(Math.round(quote.beforeDiscount / 4));
    expect(quote.afterDiscountPerPerson).toBe(Math.round(quote.afterDiscount / 4));
    expect(quote.discountAmountPerPerson).toBe(quote.beforeDiscountPerPerson - quote.afterDiscountPerPerson);
  });

  test("rejects meeting counts below five or outside the five-meeting step", () => {
    expect(() => getCustomPlanPriceQuote(CUSTOM_MIN_MEETINGS - 1, 3, 3)).toThrow(RangeError);
    expect(() => getCustomPlanPriceQuote(CUSTOM_MIN_MEETINGS + 1, 3, 3)).toThrow(
      `Jumlah pertemuan harus kelipatan ${CUSTOM_MEETING_STEP}.`,
    );
  });

  test("applies additional voucher discount on top of the 40% promo price", () => {
    const baseQuote = getCustomPlanPriceQuote(15, 3, 3);
    const voucherQuote = getCustomPlanPriceQuote(15, 3, 3, 10);

    expect(voucherQuote.afterDiscount).toBe(baseQuote.afterDiscount);
    expect(voucherQuote.voucherDiscountPercent).toBe(10);
    expect(voucherQuote.voucherDiscountAmount).toBe(Math.round(baseQuote.afterDiscount * 0.1));
    expect(voucherQuote.finalPrice).toBe(baseQuote.afterDiscount - voucherQuote.voucherDiscountAmount!);
    expect(voucherQuote.finalPricePerPerson).toBe(Math.round(voucherQuote.finalPrice! / 3));
    expect(voucherQuote.voucherDiscountAmountPerPerson).toBe(Math.round(voucherQuote.voucherDiscountAmount! / 3));
    expect(voucherQuote.totalSavings).toBe(baseQuote.discountAmount + voucherQuote.voucherDiscountAmount!);
  });

  test("rejects invalid voucher discount percentages", () => {
    expect(() => getCustomPlanPriceQuote(15, 3, 3, 0)).toThrow(RangeError);
    expect(() => getCustomPlanPriceQuote(15, 3, 3, 101)).toThrow(RangeError);
    expect(() => getCustomPlanPriceQuote(15, 3, 3, -5)).toThrow(RangeError);
  });
});

