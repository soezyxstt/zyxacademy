import { env } from "@/lib/env";
import { buildWhatsAppPlanUrl, getPlanPricingPhase, type PlanPricingPhase } from "./pricing-calculations";
import type { PricingDiscounts } from "./pricing-discounts";

export * from "./pricing-calculations";

/**
 * Constructs the WhatsApp URL for a plan with customized pre-filled message.
 */
export const getWhatsAppPlanUrl = (
  planKey: 'free' | 'minimal' | 'essential' | 'premium' | 'custom',
  planName: string,
  persons: number,
  courses: number,
  selectedCourses?: string[],
  phase: PlanPricingPhase = getPlanPricingPhase(),
  settings?: PricingDiscounts,
): string | null => {
  const rawNumber = env.NEXT_PUBLIC_WHATSAPP_NUMBER?.trim();
  const digits = rawNumber?.replace(/\D/g, "") ?? "";
  if (digits.length < 8) return null;

  return buildWhatsAppPlanUrl(digits, planKey, planName, persons, courses, selectedCourses, phase, settings);
};
