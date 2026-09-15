import Link from "next/link";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlanPrice, PlanPromotion } from "@/components/pricing/plan-price";
import { PlanConsultationLink } from "@/components/pricing/plan-consultation-link";
import { CORE_SUBJECTS, DEFAULT_PERSONS, DEFAULT_COURSES } from "@/lib/pricing-constants";
import { previewPlanTiers } from "@/lib/plan-tiers";
import { cn } from "@/lib/utils";

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
  return (
    <div
      className={className}
      data-pricing-persons={DEFAULT_PERSONS}
      data-pricing-courses={DEFAULT_COURSES}
    >
      <PlanPromotion className="mb-3" />
      <div className="grid gap-4 md:grid-cols-3">
        {previewPlanTiers.map((tier) => (
          <Card
            key={tier.key}
            className={cn(
              "flex h-full flex-col shadow-sm",
              tier.highlighted && "border-primary ring-1 ring-primary/20",
            )}
          >
            <CardHeader className="p-4 pb-3">
              <div className="flex min-h-6 items-start justify-between gap-2">
                <CardTitle className="text-body-base">{tier.name}</CardTitle>
                {tier.highlighted ? <Badge variant="default">Rekomendasi</Badge> : null}
              </div>
              <p className="text-body-xs text-muted-foreground">{tier.note}</p>
              <div className="pt-2">
                <PlanPrice
                  plan={tier.key}
                  persons={DEFAULT_PERSONS}
                  courses={DEFAULT_COURSES}
                  perPerson={perPerson}
                />
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col p-4 pt-0">
              <ul className="flex-1 space-y-2 border-t border-border pt-3">
                {tier.features.slice(0, 2).map((feature) => (
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
                <Link href="/plans">Pelajari paket {tier.name}</Link>
              </Button>
              {showConsultationLink ? (
                <PlanConsultationLink
                  plan={tier.key}
                  planName={tier.name}
                  persons={DEFAULT_PERSONS}
                  courses={DEFAULT_COURSES}
                  selectedCourses={CORE_SUBJECTS.slice(0, DEFAULT_COURSES)}
                />
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
