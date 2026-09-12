"use client";

import { Badge } from "@/components/ui/badge";
import { usePlanPricingPhase } from "@/hooks/use-plan-pricing-phase";
import { formatPlanPrice, getPlanPriceQuote } from "@/lib/pricing-constants";
import type { PlanKey } from "@/lib/plan-tiers";
import { cn } from "@/lib/utils";

export function PlanPrice({ plan, persons, courses, perPerson = false, className }: {
  plan: PlanKey;
  persons: number;
  courses: number;
  perPerson?: boolean;
  className?: string;
}) {
  const phase = usePlanPricingPhase();
  if (phase === null) {
    return <div className="min-h-20 text-body-xs text-muted-foreground" role="status">Memuat harga...</div>;
  }
  const quote = getPlanPriceQuote(plan, persons, courses, phase);
  const amount = perPerson ? Math.round(quote.price / persons) : quote.price;
  const regularAmount = perPerson ? Math.round(quote.regularPrice / persons) : quote.regularPrice;
  return (
    <div className="space-y-1" data-plan-price={plan}>
      {quote.isIntroductory && (
        <div className="flex items-center justify-between gap-2">
          <s className="text-body-sm text-muted-foreground" aria-label={`Harga reguler mulai 12 Oktober 2026: ${formatPlanPrice(regularAmount)}${perPerson ? " per orang" : " per semester"}`}>
            {formatPlanPrice(regularAmount)}
          </s>
          <Badge className="shrink-0 rounded-md border-[var(--zx-accent)]/30 bg-[var(--zx-accent)]/10 px-2 py-0.5 text-[var(--zx-accent)]">40% off</Badge>
        </div>
      )}
      <p className={cn("font-heading text-body-base font-bold text-foreground", className)}>
        {formatPlanPrice(amount)}
        {perPerson && <span className="ml-1 font-sans text-body-xs font-normal text-muted-foreground">/ orang</span>}
      </p>
      <p className="text-body-xs text-muted-foreground">
        {perPerson ? `Total ${formatPlanPrice(quote.price)} / semester` : "Total per semester"}
      </p>
    </div>
  );
}

export function PlanPromotion({ className }: { className?: string }) {
  const phase = usePlanPricingPhase();
  if (phase !== "intro") return null;
  return (
    <p className={cn("text-body-xs text-muted-foreground", className)}>
      <strong className="font-semibold text-foreground">Harga perkenalan sampai 11 Oktober 2026, 23.59 WIB.</strong>{" "}
      Harga coret berlaku mulai 12 Oktober 2026.
    </p>
  );
}
