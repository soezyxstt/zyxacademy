import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getTranslations } from "@/lib/i18n/server";
import { adminDocs, docSectionId } from "@/lib/admin-docs";

export default async function AdminDocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = adminDocs.find((item) => item.slug === slug);
  if (!doc) notFound();
  const t = await getTranslations("admin.docs");

  return (
    <div className="space-y-6">
      <PageHeader title={<span lang="id">{doc.title}</span>} backHref="/admin/docs" backLabel={t("title")} />
      <article lang="id" className="max-w-3xl space-y-8 text-body-base leading-relaxed">
        <p className="text-muted-foreground">{doc.summary}</p>
        {doc.sections.map((section, index) => (
          <section key={section.title} id={docSectionId(index)} className="scroll-mt-20 space-y-3">
            <h2 className="font-heading text-body-base font-bold">{section.title}</h2>
            {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {section.steps && <ol className="list-decimal space-y-2 pl-6">{section.steps.map((step) => <li key={step}>{step}</li>)}</ol>}
            {section.examples && <ul className="list-disc space-y-2 pl-6">{section.examples.map((example) => <li key={example} className="break-words">{example}</li>)}</ul>}
          </section>
        ))}
      </article>
    </div>
  );
}
