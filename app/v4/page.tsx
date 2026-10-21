import type { Metadata } from "next";
import { ArticleParts } from "@/components/course/article-parts";
import { MathText } from "@/components/course/math-text";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { verificationPreviewSchema } from "@/lib/materials/verification-preview";
import data from "@/lib/materials/v4-preview.json";

export const metadata: Metadata = { title: "Artikel V4 | Zyx", robots: { index: false, follow: false } };

export default function V4PreviewPage() {
  const preview = verificationPreviewSchema.parse(data);
  return <main id="main-content" className="mx-auto max-w-3xl space-y-8 px-4 py-8">
    <PageHeader title="Limit fungsi" actions={<Button asChild variant="outline"><a href="/v4/diktat.pdf">Unduh diktat</a></Button>} />
    <p className="text-body-sm text-muted-foreground">Pratinjau artikel V4. Materi pada kelas tetap mengikuti versi yang dipublikasikan.</p>
    {preview.sections.map(section => <section key={section.id} className="space-y-5">
      <h2 className="font-heading text-body-base font-bold"><MathText>{section.title}</MathText></h2>
      {section.blocks.map(block => <ArticleParts key={block.id} parts={block.parts} visuals={preview.visuals} />)}
    </section>)}
  </main>;
}
