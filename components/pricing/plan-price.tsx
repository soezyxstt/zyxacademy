"use client";

import { getJakartaCalendarDate } from "@/lib/date-utils";
import { Badge } from "@/components/ui/badge";
import { usePricingDiscounts } from "@/hooks/use-pricing-discounts";
import { formatPlanPrice, getPlanPriceQuote } from "@/lib/pricing-constants";
import type { PlanKey } from "@/lib/plan-tiers";
import { cn } from "@/lib/utils";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";

export function PlanPrice({ plan, persons, courses, perPerson = false, className }: {
  plan: PlanKey;
  persons: number;
  courses: number;
  perPerson?: boolean;
  className?: string;
}) {
  const t = useTranslations("marketing");
  const { settings, now, error } = usePricingDiscounts();
  if (error) return <p role="status" className="text-body-xs text-muted-foreground">{t("discounts.unavailable")}</p>;
  if (!settings || !now) {
    return <div className="min-h-20 text-body-xs text-muted-foreground" role="status">{t("pricing.loading")}</div>;
  }
  const quote = getPlanPriceQuote(plan, persons, courses, undefined, settings, now);
  const amount = perPerson ? Math.round(quote.price / persons) : quote.price;
  const regularAmount = perPerson ? Math.round(quote.regularPrice / persons) : quote.regularPrice;
  return (
    <div className="space-y-1" data-plan-price={plan}>
      {quote.isIntroductory && (
        <div className="flex items-center justify-between gap-2">
          <s className="text-body-sm text-muted-foreground" aria-label={formatPlanPrice(regularAmount)}>
            {formatPlanPrice(regularAmount)}
          </s>
          <Badge className="shrink-0 rounded-md border-[var(--zx-accent)]/30 bg-[var(--zx-accent)]/10 px-2 py-0.5 text-[var(--zx-accent)]">{t("pricing.discount", { percent: quote.discountPercent })}</Badge>
        </div>
      )}
      <p className={cn("font-heading text-body-base font-bold text-foreground", className)}>
        {formatPlanPrice(amount)}
        {perPerson && <span className="ml-1 font-sans text-body-xs font-normal text-muted-foreground">/ {t("pricing.person")}</span>}
      </p>
      <p className="text-body-xs text-muted-foreground">
        {perPerson ? t("pricing.totalPerSemester", { price: formatPlanPrice(quote.price) }) : t("pricing.totalSemester")}
      </p>
    </div>
  );
}

export function PlanPromotion({ className, variant = "text" }: {
  className?: string;
  variant?: "text" | "banner";
}) {
  const t = useTranslations("marketing");
  const { locale } = useAppLocale();
  const { settings, now } = usePricingDiscounts();
  if (!settings || !now) return null;
  const day = getJakartaCalendarDate(now);
  const active = (["platform", "tutorial"] as const).filter((key) => settings[key].percent > 0 && day >= settings[key].startsOn && day <= settings[key].endsOn);
  if (!active.length) return null;

  if (variant === "banner") {
    const date = new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
    return (
      <ul className={cn("flex flex-wrap gap-2", className)} data-plan-promotions="" role="list">
        {active.map((key) => {
          const { percent, startsOn, endsOn } = settings[key];
          return (
            <li key={key} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-zx-accent/35 bg-card px-3 py-2 sm:w-auto">
              <span className="rounded-md bg-zx-accent/10 px-2 py-1 text-body-sm font-semibold text-foreground">
                {t(`discounts.${key}Offer`, { percent })}
              </span>
              <span className="text-body-xs text-muted-foreground">
                {t("discounts.period", {
                  start: date.format(new Date(`${startsOn}T00:00:00Z`)),
                  end: date.format(new Date(`${endsOn}T00:00:00Z`)),
                })}
              </span>
            </li>
          );
        })}
      </ul>
    );
  }

  return <div className={cn("text-body-xs text-muted-foreground", className)}>
    {active.map((key) => <p key={key}>{t("discounts.schedule", { component: t(`discounts.${key}`), percent: settings[key].percent, start: settings[key].startsOn, end: settings[key].endsOn })}</p>)}
  </div>;
}
