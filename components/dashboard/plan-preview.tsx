import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlanPreviewGrid } from "@/components/pricing/plan-preview-grid";

export function DashboardPlanPreview() {
  return (
    <section className="mt-10 border-t border-border pt-8 text-left" aria-labelledby="dashboard-plan-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-body-xs font-semibold uppercase tracking-wide text-brand-primary">
            Pilihan paket
          </p>
          <h3 id="dashboard-plan-title" className="mt-1 font-heading text-body-base font-semibold text-foreground">
            Pilih dukungan belajar yang cocok
          </h3>
          <p className="mt-1 max-w-xl text-body-sm text-muted-foreground">
            Bandingkan akses belajar mandiri, tutorial, dan konsultasi dalam satu semester.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="self-start sm:self-auto">
          <Link href="/plans">
            Lihat semua paket
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </Button>
      </div>

      <p className="mt-5 text-body-xs text-muted-foreground">
        Estimasi untuk 3 orang dan 3 mata kuliah.
      </p>
      <PlanPreviewGrid className="mt-3" />
    </section>
  );
}
