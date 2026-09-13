import { SectionContainer } from "@/components/layout/section-container";
import { SectionHeading } from "@/components/ui/section-heading";
import { PlanPreviewGrid } from "@/components/pricing/plan-preview-grid";

export function LandingPricingPreview() {
  return (
    <SectionContainer
      id="pricing"
      className="border-b border-border bg-background"
      aria-labelledby="pricing-preview-heading"
    >
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-body-xs font-semibold uppercase tracking-[0.2em] text-[var(--zx-accent)]">Paket</p>
        <SectionHeading id="pricing-preview-heading" tier="secondary" className="mt-2 text-foreground">
          Pilih dukungan belajar yang cocok
        </SectionHeading>
        <p className="mt-3 text-body-base text-muted-foreground">
          Mulai dari akses belajar mandiri, lalu tambah tutorial dan konsultasi sesuai kebutuhan
          kelompokmu.
        </p>
      </div>

      <div className="mx-auto mt-8 max-w-6xl text-left">
        <p className="mb-3 text-body-sm text-muted-foreground">
          Harga utama per orang per semester. Contoh ini untuk 3 orang dan 3 mata kuliah;
          total grup ditampilkan di setiap paket.
        </p>
        <PlanPreviewGrid perPerson showConsultationLink />
      </div>
    </SectionContainer>
  );
}
