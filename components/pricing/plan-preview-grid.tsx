"use client";

import { useTranslations } from "@/lib/i18n/client";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlanPrice, PlanPromotion } from "@/components/pricing/plan-price";
import { PlanConsultationLink } from "@/components/pricing/plan-consultation-link";
import { CORE_SUBJECTS, DEFAULT_PERSONS, DEFAULT_COURSES } from "@/lib/pricing-constants";
import { previewPlanTiers } from "@/lib/plan-tiers";
import { cn } from "@/lib/utils";
import { LocalizedPublicLink } from "@/components/localized-public-link";

type PlanPreviewGridProps = {
  className?: string;
  perPerson?: boolean;
  showConsultationLink?: boolean;
};

export function PlanPreviewGrid({
  className,
  perPerson = false,
  showConsultationLink = false,
}: PlanPreviewGridProps) {
  const t = useTranslations("marketing");
  return (
    <div
      className={className}
      data-pricing-persons={DEFAULT_PERSONS}
      data-pricing-courses={DEFAULT_COURSES}
    >
      <PlanPromotion className="mb-3" />
      <div className="grid gap-4 md:grid-cols-3">
        {previewPlanTiers.map((tier) => (
          <article
            key={tier.key}
            className={cn(
              "flex h-full min-w-0 flex-col border-t border-border pt-3",
              tier.highlighted && "border-primary",
            )}
          >
            <header className="space-y-1 pb-3">
              <div className="flex min-h-6 items-start justify-between gap-2">
                <h3 className="font-heading text-body-base font-bold">{t(`pricing.tiers.${tier.key}.name`)}</h3>
                {tier.highlighted ? <Badge variant="default">{t("pricing.recommended")}</Badge> : null}
              </div>
              <p className="text-body-xs text-muted-foreground">{t(`pricing.tiers.${tier.key}.note`)}</p>
              <div className="pt-2">
                <PlanPrice
                  plan={tier.key}
                  persons={DEFAULT_PERSONS}
                  courses={DEFAULT_COURSES}
                  perPerson={perPerson}
                />
              </div>
            </header>
            <div className="flex flex-1 flex-col">
              <ul className="flex-1 space-y-2 border-t border-border pt-3">
                {(t.raw(`pricing.tiers.${tier.key}.features`) as string[]).slice(0, 2).map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-body-xs text-muted-foreground">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-status-success" aria-hidden="true" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Button
                asChild
                variant={tier.highlighted ? "default" : "outline"}
                size="sm"
                className="mt-3 w-full"
              >
                <LocalizedPublicLink href="/plans">{t("pricing.learnPlan", { plan: t(`pricing.tiers.${tier.key}.name`) })}</LocalizedPublicLink>
              </Button>
              {showConsultationLink ? (
                <PlanConsultationLink
                  plan={tier.key}
                  planName={t(`pricing.tiers.${tier.key}.name`)}
                  persons={DEFAULT_PERSONS}
                  courses={DEFAULT_COURSES}
                  selectedCourses={CORE_SUBJECTS.slice(0, DEFAULT_COURSES)}
                />
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
