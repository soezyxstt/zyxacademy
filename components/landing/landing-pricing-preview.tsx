import { SectionContainer } from "@/components/layout/section-container";
import { SectionHeading } from "@/components/ui/section-heading";
import { PlanPreviewGrid } from "@/components/pricing/plan-preview-grid";
import { getTranslations } from "@/lib/i18n/server";

export async function LandingPricingPreview() {
  const t = await getTranslations("marketing");
  return (
    <SectionContainer
      id="pricing"
      className="border-b border-border bg-background"
      aria-labelledby="pricing-preview-heading"
    >
      <div className="mx-auto max-w-3xl text-center">
        <SectionHeading id="pricing-preview-heading" tier="secondary" className="text-foreground">
          {t("home.pricingTitle")}
        </SectionHeading>
        <p className="mt-3 text-body-base text-muted-foreground">
          {t("home.pricingDescription")}
        </p>
      </div>

      <div className="mx-auto mt-8 max-w-6xl text-left">
        <PlanPreviewGrid perPerson showConsultationLink />
      </div>
    </SectionContainer>
  );
}
