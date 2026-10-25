import { BookOpen } from "lucide-react";
import { Card } from "@/components/ui/card";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import type { PublicArticleReadModel } from "@/lib/articles/structured-read-model";
import { DemoAuthCta } from "./demo-shell";
import { getTranslations } from "@/lib/i18n/server";

export async function DemoArticleView({ article, nextPath }: { article: PublicArticleReadModel; nextPath: string }) {
  const t = await getTranslations("marketing");
  return (
    <article className="mx-auto max-w-3xl">
      <Card variant="solid" className="p-5 sm:p-8">
        <div className="flex items-start gap-3 border-b border-border pb-5">
          <BookOpen className="mt-1 size-5 shrink-0 text-brand-primary" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="font-heading text-h5 font-bold tracking-tight text-foreground">{article.title}</h2>
            <p className="mt-1 text-body-xs text-muted-foreground">
              {t("demo.article.readingInfo", { minutes: article.totalEstimatedReadingMinutes, sections: article.sections.length })}
            </p>
          </div>
        </div>

        <div className="mt-8 space-y-10">
          {article.sections.map((section) => (
            <section key={section.id} id={section.slug} className="scroll-mt-24">
              <h3 className="font-heading text-body-base font-bold text-foreground">{section.title}</h3>
              {section.learningObjective ? (
                <p className="mt-1 text-body-xs text-muted-foreground">{t("demo.article.objective", { objective: section.learningObjective })}</p>
              ) : null}
              <div className="mt-5 space-y-6">
                {section.blocks.map((block) => (
                  <div key={block.id}>
                    {block.title ? (
                      <h4 className="mb-2 font-heading text-body-sm font-semibold text-foreground">{block.title}</h4>
                    ) : null}
                    <MarkdownRenderer content={block.content} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </Card>

      <div className="mt-5 flex flex-col gap-3 rounded-xl border border-brand-primary/20 bg-brand-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-body-base font-bold text-foreground">{t("demo.article.ctaTitle")}</h2>
          <p className="mt-1 text-body-xs text-muted-foreground">{t("demo.article.ctaDescription")}</p>
        </div>
        <DemoAuthCta nextPath={nextPath} label={t("demo.authCta")} />
      </div>
    </article>
  );
}
