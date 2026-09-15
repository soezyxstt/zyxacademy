import { describe, expect, test } from "bun:test";
import { buildWhatsAppPlanUrl, calculatePlanPrice, getPlanPriceQuote, getPlanPricingPhase } from "@/lib/pricing-constants";

const TEST_WHATSAPP_NUMBER = "12345678";

function getTestWhatsAppPlanUrl(
  planKey: Parameters<typeof buildWhatsAppPlanUrl>[1],
  planName: string,
  persons: number,
  courses: number,
  selectedCourses?: string[],
  phase?: Parameters<typeof buildWhatsAppPlanUrl>[6],
) {
  return buildWhatsAppPlanUrl(TEST_WHATSAPP_NUMBER, planKey, planName, persons, courses, selectedCourses, phase);
}

describe("scheduled introductory pricing", () => {
  test("uses Jakarta midnight for both boundaries", () => {
    expect(getPlanPricingPhase(new Date("2026-09-11T16:59:59.999Z"))).toBe("before");
    expect(getPlanPricingPhase(new Date("2026-09-11T17:00:00Z"))).toBe("intro");
    expect(getPlanPricingPhase(new Date("2026-10-11T16:59:59.999Z"))).toBe("intro");
    expect(getPlanPricingPhase(new Date("2026-10-11T17:00:00Z"))).toBe("regular");
  });

  test("preserves known existing formula prices during introduction", () => {
    expect(getPlanPriceQuote("minimal", 1, 1, "intro").price).toBe(250000);
    expect(getPlanPriceQuote("essential", 1, 1, "intro").price).toBe(2575000);
    expect(getPlanPriceQuote("premium", 1, 1, "intro").price).toBe(4935000);
  });

  test("all supported configurations actually charge the regular price after expiry", () => {
    for (const plan of ["minimal", "essential", "premium"] as const) {
      for (let persons = 1; persons <= 5; persons++) {
        for (let courses = 1; courses <= 5; courses++) {
          const intro = getPlanPriceQuote(plan, persons, courses, "intro");
          const regular = calculatePlanPrice(plan, persons, courses, new Date("2026-10-12T00:00:00+07:00"));
          expect(intro.isIntroductory).toBe(true);
          expect(regular).toBe(intro.regularPrice);
          expect(regular).toBe(Math.ceil(intro.price * 5 / 3));
          expect(getPlanPriceQuote(plan, persons, courses, "regular").isIntroductory).toBe(false);
          expect(getPlanPriceQuote(plan, persons, courses, "before").price).toBe(intro.price);
          expect(getPlanPriceQuote(plan, persons, courses, "before").isIntroductory).toBe(false);
        }
      }
    }
  });

  test("free and custom never advertise savings", () => {
    for (const plan of ["free", "custom"] as const) {
      for (const phase of ["before", "intro", "regular"] as const) {
        expect(getPlanPriceQuote(plan, 3, 3, phase)).toEqual({ price: 0, regularPrice: 0, isIntroductory: false });
        expect(new URL(getTestWhatsAppPlanUrl(plan, plan, 3, 3, [], phase)).searchParams.get("text")).not.toContain("40%");
      }
    }
  });

  test("WhatsApp enrollment carries the applicable price and only active promotion", () => {
    const message = (phase: "intro" | "regular") => new URL(getTestWhatsAppPlanUrl("minimal", "Minimal", 1, 1, ["Matematika I"], phase)).searchParams.get("text")!;
    expect(message("intro")).toContain("Rp 250.000");
    expect(message("intro")).toContain("11 Oktober 2026");
    expect(message("intro")).toContain("Matematika I");
    expect(message("regular")).toContain("Rp 416.667");
    expect(message("regular")).not.toContain("40%");
    expect(message("regular")).not.toContain("Rp 250.000");
  });
});
