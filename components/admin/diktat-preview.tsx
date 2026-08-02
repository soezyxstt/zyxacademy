import type { DiktatCompressionReport, DiktatDocument } from "@/lib/materials/diktat-contract";
import type { QualityGateResult } from "@/lib/materials/quality-gates";

export interface DiktatPreviewProps {
  diktat: DiktatDocument;
  report?: DiktatCompressionReport;
  quality?: QualityGateResult;
}
export function DiktatPreview({ diktat, report, quality }: DiktatPreviewProps) {
  return (
    <section className="space-y-6" aria-labelledby={`${diktat.id}-preview-title`}>
      <div className="border-b border-border pb-4">
        <p className="text-body-sm text-muted-foreground">Diktat preview</p>
        <h2 id={`${diktat.id}-preview-title`} className="font-heading text-h4">{diktat.title}</h2>
        <p className="text-body-sm text-muted-foreground">
          Source article {diktat.sourceArticleId}, version {diktat.sourceArticleVersion}
        </p>
      </div>
      {quality ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-body-sm font-semibold">Quality gate: {quality.passed ? "passed" : "blocked"}</p>
          <p className="text-body-sm text-muted-foreground">Idea coverage: {quality.metrics.ideaCoveragePercent ?? 0}%</p>
          {quality.issues.length > 0 ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-body-sm text-status-error">
              {quality.issues.map((item) => <li key={`${item.code}:${item.ideaId ?? ""}`}>{item.code}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}
      {report ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-4"><p className="text-body-sm text-muted-foreground">Preserved blocks</p><p className="font-heading text-h5">{report.preservedBlockIds.length}</p></div>
          <div className="rounded-xl border border-border bg-card p-4"><p className="text-body-sm text-muted-foreground">Removed blocks</p><p className="font-heading text-h5">{report.removedBlockIds.length}</p></div>
          <div className="rounded-xl border border-border bg-card p-4"><p className="text-body-sm text-muted-foreground">Formulas preserved</p><p className="font-heading text-h5">{report.preservedFormulaBlockIds.length}</p></div>
        </div>
      ) : null}
      <div className="rounded-xl border border-border bg-card p-5">
        <pre className="whitespace-pre-wrap font-sans text-body-base">{diktat.markdown}</pre>
      </div>
    </section>
  );
}
