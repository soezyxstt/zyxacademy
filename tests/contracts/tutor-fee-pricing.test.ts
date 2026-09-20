import { describe, expect, test } from "bun:test";
import {
  getTutorFeeQuote,
  getPlatformCost,
  TUTOR_FEE_SHARE_PERCENT,
  MANAGEMENT_FEE_SHARE_PERCENT,
} from "@/lib/pricing-constants";

describe("tutor fee calculator", () => {
  test("calculates tutor and management fee correctly for standard 15 meetings, 3 persons, 3 courses", () => {
    const quote = getTutorFeeQuote(15, 3, 3);
    const platformCost = getPlatformCost(250, 3, 3);

    expect(quote.meetings).toBe(15);
    expect(quote.persons).toBe(3);
    expect(quote.courses).toBe(3);
    expect(quote.platformCost).toBe(platformCost);

    // Introductory (promo 40% discount)
    const intro = quote.introductory;
    expect(intro.packagePrice).toBe(4_995_000);
    expect(intro.tutorialPool).toBe(intro.packagePrice - platformCost);
    expect(intro.tutorFeeTotal).toBe(Math.round(intro.tutorialPool * (TUTOR_FEE_SHARE_PERCENT / 100)));
    expect(intro.managementFeeTotal).toBe(intro.tutorialPool - intro.tutorFeeTotal);
    expect(intro.tutorFeePerMeeting).toBe(Math.round(intro.tutorFeeTotal / 15));
    expect(intro.managementFeePerMeeting).toBe(Math.round(intro.managementFeeTotal / 15));
    expect(intro.tutorFeePerPersonPerMeeting).toBe(Math.round(intro.tutorFeePerMeeting / 3));

    // Regular (before discount)
    const reg = quote.regular;
    expect(reg.packagePrice).toBe(8_325_000);
    expect(reg.tutorialPool).toBe(reg.packagePrice - platformCost);
    expect(reg.tutorFeeTotal).toBe(Math.round(reg.tutorialPool * (TUTOR_FEE_SHARE_PERCENT / 100)));
    expect(reg.managementFeeTotal).toBe(reg.tutorialPool - reg.tutorFeeTotal);
    expect(reg.tutorFeePerMeeting).toBe(Math.round(reg.tutorFeeTotal / 15));
    expect(reg.managementFeePerMeeting).toBe(Math.round(reg.managementFeeTotal / 15));
  });

  test("calculates correctly with custom package price override", () => {
    const customPrice = 3_500_000;
    const quote = getTutorFeeQuote(10, 2, 2, customPrice);

    expect(quote.custom).toBeDefined();
    const custom = quote.custom!;
    expect(custom.packagePrice).toBe(customPrice);

    const platformCost = getPlatformCost(250, 2, 2);
    const expectedPool = customPrice - platformCost;
    expect(custom.tutorialPool).toBe(expectedPool);
    expect(custom.tutorFeeTotal).toBe(Math.round(expectedPool * 0.7));
    expect(custom.managementFeeTotal).toBe(expectedPool - custom.tutorFeeTotal);
    expect(custom.tutorFeePerMeeting).toBe(Math.round(custom.tutorFeeTotal / 10));
    expect(custom.managementFeePerMeeting).toBe(Math.round(custom.managementFeeTotal / 10));
  });

  test("handles zero tutorial pool when package price is less than platform cost", () => {
    const veryLowPrice = 100_000;
    const quote = getTutorFeeQuote(10, 3, 3, veryLowPrice);

    expect(quote.custom).toBeDefined();
    const custom = quote.custom!;
    expect(custom.tutorialPool).toBe(0);
    expect(custom.tutorFeeTotal).toBe(0);
    expect(custom.managementFeeTotal).toBe(0);
    expect(custom.tutorFeePerMeeting).toBe(0);
    expect(custom.managementFeePerMeeting).toBe(0);
  });

  test("rejects non-positive quantities", () => {
    expect(() => getTutorFeeQuote(0, 3, 3)).toThrow(RangeError);
    expect(() => getTutorFeeQuote(5, 0, 3)).toThrow(RangeError);
    expect(() => getTutorFeeQuote(5, 3, 0)).toThrow(RangeError);
    expect(() => getTutorFeeQuote(5, 3, 3, 0)).toThrow(RangeError);
    expect(() => getTutorFeeQuote(5, 3, 3, -100)).toThrow(RangeError);
  });
});
