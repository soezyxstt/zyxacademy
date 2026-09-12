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
    return <div className="min-h-32 text-body-xs text-muted-foreground" role="status">Memuat harga...</div>;
  }
  const quote = getPlanPriceQuote(plan, persons, courses, phase);
  const amount = perPerson ? Math.round(quote.price / persons) : quote.price;
  return (
    <div className="space-y-1" data-plan-price={plan}>
      {quote.isIntroductory && (
        <>
          <Badge variant="outline" className="border-primary/30 text-primary">Hemat 40%</Badge>
          <p className="text-body-xs text-muted-foreground">
            Reguler mulai 12 Okt: {formatPlanPrice(quote.regularPrice)} / semester
          </p>
        </>
      )}
      <p className={cn("font-heading text-body-base font-bold text-foreground", className)}>
        {formatPlanPrice(amount)}
        {perPerson && <span className="ml-1 font-sans text-body-xs font-normal text-muted-foreground">/ orang</span>}
      </p>
      <p className="text-body-xs text-muted-foreground">
        {perPerson ? `Total ${formatPlanPrice(quote.price)} / semester` : "Total per semester"}
      </p>
      {quote.isIntroductory && <p className="text-body-xs text-muted-foreground">Harga perkenalan sampai 11 Okt 2026</p>}
    </div>
  );
}

export function PlanPromotion({ className }: { className?: string }) {
  const phase = usePlanPricingPhase();
  if (phase !== "intro") return null;
  return (
    <p className={cn("text-body-xs text-muted-foreground", className)}>
      <strong className="font-semibold text-primary">Mumpung harga perkenalan, hemat 40%.</strong>{" "}
      Berlaku 12 September sampai 11 Oktober 2026 pukul 23.59 WIB. Harga reguler berlaku mulai 12 Oktober 2026.
    </p>
  );
}
