import type { Metadata } from "next";
import { getTranslations } from "@/lib/i18n/server";
import { ArticleParts } from "@/components/course/article-parts";
import { MathText } from "@/components/course/math-text";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { verificationPreviewSchema } from "@/lib/materials/verification-preview";
import data from "@/lib/materials/v4-preview.json";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing");
  return { title: t("meta.v4Preview.title"), description: t("meta.v4Preview.description"), robots: { index: false, follow: false } };
}

export default function V4PreviewPage() {
  const preview = verificationPreviewSchema.parse(data);
  return <main id="main-content" className="mx-auto max-w-3xl space-y-(--reading-section-gap) px-(--page-gutter) pt-(--page-top) pb-(--reading-section-gap)">
    <div className="space-y-(--compact-gap)">
      <PageHeader title="Limit fungsi" actions={<Button asChild variant="outline"><a href="/v4/diktat.pdf">Unduh diktat</a></Button>} />
      <p className="text-body-xs text-muted-foreground">Materi pada kelas tetap mengikuti versi yang dipublikasikan.</p>
    </div>
    {preview.sections.map(section => <section key={section.id} className="space-y-(--group-gap)">
      <h2 className="font-heading text-reading-minor font-bold"><MathText>{section.title}</MathText></h2>
      {section.blocks.map(block => <ArticleParts key={block.id} parts={block.parts} visuals={preview.visuals} />)}
    </section>)}
  </main>;
}
