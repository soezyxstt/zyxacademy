import Link from "next/link";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { previewPlanTiers } from "@/lib/plan-tiers";
import { cn } from "@/lib/utils";

export function PlanPreviewGrid({ className }: { className?: string }) {
  return (
    <div className={cn("grid gap-4 md:grid-cols-3", className)}>
      {previewPlanTiers.map((tier) => (
        <Card
          key={tier.key}
          className={cn(
            "flex h-full flex-col shadow-sm",
            tier.highlighted && "border-primary ring-1 ring-primary/20",
          )}
        >
          <CardHeader className="p-5 pb-3">
            <div className="flex min-h-6 items-start justify-between gap-2">
              <CardTitle className="text-body-base">{tier.name}</CardTitle>
              {tier.highlighted ? <Badge variant="default">Rekomendasi</Badge> : null}
            </div>
            <p className="text-body-xs text-muted-foreground">{tier.note}</p>
            <div className="pt-2">
              <p className="font-heading text-body-base font-bold text-foreground">{tier.price}</p>
              <p className="text-body-xs text-muted-foreground">Total per semester</p>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col p-5 pt-0">
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
              className="mt-5 w-full"
            >
              <Link href="/plans">Pelajari paket {tier.name}</Link>
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
