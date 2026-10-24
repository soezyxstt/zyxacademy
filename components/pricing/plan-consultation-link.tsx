"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { usePlanPricingPhase } from "@/hooks/use-plan-pricing-phase";
import { getWhatsAppPlanUrl } from "@/lib/pricing-constants";
import type { PlanKey } from "@/lib/plan-tiers";
import { useTranslations } from "@/lib/i18n/client";

type PlanConsultationLinkProps = {
  plan: PlanKey;
  planName: string;
  persons: number;
  courses: number;
  selectedCourses?: string[];
};

export function PlanConsultationLink({
  plan,
  planName,
  persons,
  courses,
  selectedCourses,
}: PlanConsultationLinkProps) {
  const t = useTranslations("marketing");
  const phase = usePlanPricingPhase();
  if (phase === null) return null;

  const href = getWhatsAppPlanUrl(plan, planName, persons, courses, selectedCourses, phase);
  if (!href) return null;

  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center gap-1.5 text-body-xs font-semibold text-primary underline-offset-4 hover:underline"
      onClick={(event) => {
        const refreshedHref = getWhatsAppPlanUrl(plan, planName, persons, courses, selectedCourses);
        if (refreshedHref) event.currentTarget.href = refreshedHref;
      }}
    >
      <MessageCircle className="size-3.5" aria-hidden="true" />
      {t("pricing.askPlanWhatsapp")}
    </Link>
  );
}
