import { ChevronDown } from "lucide-react";
import { SectionContainer } from "@/components/layout/section-container";
import { SectionHeading } from "@/components/ui/section-heading";
import { getTranslations } from "@/lib/i18n/server";

const faqItems = ["faq.free", "faq.preview", "faq.paid", "faq.pricing", "faq.tutorial", "faq.activation"] as const;

export async function LandingFaq() {
  const t = await getTranslations("marketing");
  return (
    <SectionContainer className="bg-background" aria-labelledby="landing-faq-heading">
      <div className="mx-auto max-w-2xl text-center">
        <SectionHeading as="h2" id="landing-faq-heading" className="text-foreground">
          {t("faq.title")}
        </SectionHeading>
      </div>

      <div className="mx-auto mt-10 max-w-3xl">
        {faqItems.map((key) => (
          <details key={key} className="group border-b border-border first:border-t">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left font-heading text-body-base font-semibold text-foreground outline-none marker:hidden focus-visible:ring-2 focus-visible:ring-[var(--zx-accent)] [&::-webkit-details-marker]:hidden">
              <span>{t(`${key}.question`)}</span>
              <ChevronDown
                className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <p className="max-w-2xl pb-5 pr-8 text-body-base leading-relaxed text-muted-foreground">
              {t(`${key}.answer`)}
            </p>
          </details>
        ))}
      </div>
    </SectionContainer>
  );
}
