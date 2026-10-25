import type { ReactNode } from "react";
import { MarketingPageHero } from "@/components/marketing-page-hero";
import { SectionContainer } from "@/components/layout/section-container";
import { Reveal } from "@/components/ui/reveal";
import { getTranslations } from "@/lib/i18n/server";

export type LegalSection = {
  id: string;
  title: string;
  content: ReactNode;
};

type LegalDocumentPageProps = {
  documentId: string;
  title: string;
  description: string;
  updatedAt: string;
  sections: LegalSection[];
};

export async function LegalDocumentPage({
  documentId,
  title,
  description,
  updatedAt,
  sections,
}: LegalDocumentPageProps) {
  const t = await getTranslations("marketing");
  return (
    <div className="flex flex-col">
      <Reveal>
        <MarketingPageHero
          sectionId={documentId}
          title={title}
          description={description}
        />
      </Reveal>

      <Reveal>
        <SectionContainer
          tight
          className="overflow-hidden border-b border-border bg-background"
          contentClassName="max-w-6xl"
        >
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
            <aside className="lg:col-span-3">
              <div className="lg:sticky lg:top-24">
                <p className="text-body-xs font-semibold text-muted-foreground">
                  {t("legal.updatedAt")}
                </p>
                <p className="mt-1 text-body-sm font-semibold text-foreground">
                  {updatedAt}
                </p>

                <nav className="mt-8" aria-label={t("legal.tableOfContents", { title })}>
                  <h2 className="font-heading text-body-sm font-bold text-foreground">
                    {t("legal.tableOfContentsHeading")}
                  </h2>
                  <ol className="mt-3 space-y-2 border-l border-border pl-4">
                    {sections.map((section, index) => (
                      <li key={section.id}>
                        <a
                          href={`#${section.id}`}
                          className="interactive text-body-xs leading-relaxed text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {index + 1}. {section.title}
                        </a>
                      </li>
                    ))}
                  </ol>
                </nav>
              </div>
            </aside>

            <article className="min-w-0 space-y-10 lg:col-span-9">
              {sections.map((section, index) => (
                <section
                  id={section.id}
                  key={section.id}
                  aria-labelledby={`${section.id}-heading`}
                  className="scroll-mt-24 border-b border-border pb-10 last:border-b-0 last:pb-0"
                >
                  <p className="text-body-xs font-semibold text-primary">
                    {String(index + 1).padStart(2, "0")}
                  </p>
                  <h2
                    id={`${section.id}-heading`}
                    className="mt-2 font-heading text-h5 font-bold tracking-tight text-foreground"
                  >
                    {section.title}
                  </h2>
                  <div className="mt-4 space-y-4 text-body-base leading-relaxed text-muted-foreground [&_a]:font-semibold [&_a]:text-primary [&_a]:underline-offset-4 [&_a:hover]:underline [&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-2">
                    {section.content}
                  </div>
                </section>
              ))}
            </article>
          </div>
        </SectionContainer>
      </Reveal>
    </div>
  );
}
