import { SectionContainer } from "@/components/layout/section-container";
import { SectionHeading } from "@/components/ui/section-heading";
import { PlanPreviewGrid } from "@/components/pricing/plan-preview-grid";

export function LandingPricingPreview() {
  return (
    <SectionContainer className="border-b border-border bg-background" aria-labelledby="pricing-preview-heading">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-body-xs font-semibold uppercase tracking-[0.2em] text-[var(--zx-accent)]">Paket</p>
        <SectionHeading id="pricing-preview-heading" tier="secondary" className="mt-2 text-foreground">
          Pilih dukungan belajar yang cocok
        </SectionHeading>
        <p className="mt-3 text-body-base text-muted-foreground">
          Paket yang sama dengan rekomendasi pada dashboard siswa: akses belajar mandiri, tutorial,
          dan konsultasi dalam satu semester.
        </p>
      </div>

      <div className="mx-auto mt-8 max-w-6xl text-left">
        <p className="mb-3 text-body-xs text-muted-foreground">Estimasi untuk 3 orang dan 3 mata kuliah.</p>
        <PlanPreviewGrid />
      </div>
    </SectionContainer>
  );
}
