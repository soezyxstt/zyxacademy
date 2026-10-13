import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlanPreviewGrid } from "@/components/pricing/plan-preview-grid";

export function DashboardPlanPreview() {
  return (
    <section className="mt-10 border-t border-border pt-8 text-left" aria-labelledby="dashboard-plan-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 id="dashboard-plan-title" className="font-heading text-body-base font-semibold text-foreground">
            Pilih dukungan belajar yang cocok
          </h3>
        </div>
        <Button asChild variant="outline" size="sm" className="self-start sm:self-auto">
          <Link href="/plans">
            Lihat semua paket
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </Button>
      </div>

      <PlanPreviewGrid className="mt-3" />
    </section>
  );
}
