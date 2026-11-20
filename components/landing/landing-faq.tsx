import { SectionContainer } from "@/components/layout/section-container";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
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
        <Accordion type="single" collapsible className="border-t border-border">
          {faqItems.map((key) => (
            <AccordionItem key={key} value={key} className="border-b border-border last:border-b">
              <AccordionTrigger className="py-5 font-heading text-body-base font-semibold text-foreground hover:text-foreground focus-visible:ring-[var(--zx-accent)]">
                <span>{t(`${key}.question`)}</span>
              </AccordionTrigger>
              <AccordionContent className="pb-5 pr-8">
                <p className="max-w-2xl text-body-base leading-relaxed text-muted-foreground">
                  {t(`${key}.answer`)}
                </p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </SectionContainer>
  );
}
