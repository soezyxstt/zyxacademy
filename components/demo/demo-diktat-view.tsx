import { FileText, LockKeyhole } from "lucide-react";
import { Card } from "@/components/ui/card";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import type { DemoDiktatSection } from "@/app/(marketing)/demo/demo-data";
import { DemoAuthCta } from "./demo-shell";

export function DemoDiktatView({
  title,
  sections,
  nextPath,
}: {
  title: string;
  sections: DemoDiktatSection[];
  nextPath: string;
}) {
  return (
    <article className="mx-auto max-w-3xl">
      <Card variant="solid" className="p-5 sm:p-8">
        <div className="flex items-start gap-3 border-b border-border pb-5">
          <FileText className="mt-1 size-5 shrink-0 text-brand-primary" aria-hidden="true" />
          <div>
            <h2 className="font-heading text-h5 font-bold tracking-tight text-foreground">{title}</h2>
          </div>
        </div>

        <div className="mt-8 space-y-10">
          {sections.slice(0, 2).map((section, index) => (
            <section key={`${section.title}-${index}`}>
              <h3 className="font-heading text-body-base font-bold text-foreground">{section.title}</h3>
              <div className="mt-4">
                <MarkdownRenderer content={section.content} />
              </div>
            </section>
          ))}
        </div>
      </Card>

      <div className="mt-5 flex flex-col gap-3 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <LockKeyhole className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <h2 className="font-heading text-body-sm font-bold text-foreground">Baca Diktat lengkap setelah masuk</h2>
            <p className="mt-1 text-body-xs text-muted-foreground">Diktat tersedia untuk dibaca, tanpa unduhan.</p>
          </div>
        </div>
        <DemoAuthCta nextPath={nextPath} />
      </div>
    </article>
  );
}
