import type { ArticleDocument } from "@/lib/materials/article-contract";
import type { QualityGateResult } from "@/lib/materials/quality-gates";
import { MathText } from "@/components/course/math-text";

export interface ArticlePreviewProps {
  article: ArticleDocument;
  quality?: QualityGateResult;
}
export function ArticlePreview({ article, quality }: ArticlePreviewProps) {
  return (
    <section className="space-y-6" aria-labelledby={`${article.id}-preview-title`}>
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
        <div>
          <p className="text-body-sm text-muted-foreground">Article preview</p>
          <h2 id={`${article.id}-preview-title`} className="font-heading text-body-base font-bold">
            {article.title}
          </h2>
          <p className="text-body-sm text-muted-foreground">
            Version {article.version} · {article.ideaIds.length} Ideas · {article.blocks.length} blocks
          </p>
        </div>
        <span className="rounded-md border border-border px-2 py-1 text-body-sm text-muted-foreground">
          {article.reviewerState}
        </span>
      </div>
      {quality ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-body-sm font-semibold">Quality gate: {quality.passed ? "passed" : "blocked"}</p>
          <p className="text-body-sm text-muted-foreground">Coverage score: {quality.score}%</p>
          {quality.issues.length > 0 ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-body-sm text-status-error">
              {quality.issues.map((item) => <li key={`${item.code}:${item.blockId ?? ""}:${item.ideaId ?? ""}`}>{item.code}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}
      <ol className="divide-y divide-border border-y border-border">
        {article.blocks.map((block) => (
          <li key={block.id} className="space-y-2 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-heading text-body-sm font-semibold">{block.blockType.replaceAll("_", " ")}</h3>
              <span className="text-body-sm text-muted-foreground">{block.reviewerState}</span>
            </div>
            <MathText className="whitespace-pre-wrap text-body-base block" as="div">{block.content}</MathText>
            <p className="text-body-sm text-muted-foreground">
              Ideas: {block.ideaIds.length ? block.ideaIds.join(", ") : "none"} · Sources: {block.sourceRefs.length}
            </p>
            {block.applicability.status === "inapplicable" ? (
              <p className="text-body-sm text-status-warning">Not applicable: {block.applicability.reason.replaceAll("_", " ")}</p>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
