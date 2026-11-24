"use client";

import { useState, type ComponentProps } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useTranslations } from "@/lib/i18n/client";
import { ArticleCodeExample, ArticleCodingExercise, ArticleMarkdownScope, type StaticCodeLabels } from "@/components/coding/article-coding";
import { articleCaseLatex, type ArticlePart } from "@/lib/materials/article-parts";
import type { PublicVisualSpec } from "@/lib/articles/structured-read-model";
import { MathText } from "@/components/course/math-text";
import { MarkdownRenderer, type MarkdownDensity } from "@/components/course/markdown-renderer";
import { ProductLearningVisual } from "@/components/course/product-learning-visual";
import { InteractiveDocumentArticleLocation } from "@/components/course/interactive-document-context";

function ScopedMarkdown({ scope, ...props }: ComponentProps<typeof MarkdownRenderer> & { scope: string }) {
  return <ArticleMarkdownScope id={scope}><MarkdownRenderer {...props} /></ArticleMarkdownScope>;
}

const COMPACT_SYMBOL_LIMIT = 4;

function useSymbolDefinitionsLabel(count: number) {
  try {
    const t = useTranslations("studentCourse");
    return t("articleReader.symbolDefinitions", { count });
  } catch {
    return `Keterangan simbol (${count})`;
  }
}

function MathSymbolDefinitions({
  symbols,
  density,
}: {
  symbols: NonNullable<Extract<ArticlePart, { kind: "math_unit" }>["symbolDefinitions"]>;
  density?: MarkdownDensity;
}) {
  const [open, setOpen] = useState(symbols.length <= COMPACT_SYMBOL_LIMIT);
  const label = useSymbolDefinitionsLabel(symbols.length);
  const list = (
    <dl data-math-symbols className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
      {symbols.map((symbol) => (
        <div key={symbol.id} data-symbol-id={symbol.id} className="flex flex-wrap items-baseline gap-x-2">
          <dt><MarkdownRenderer content={`$${symbol.latex}$`} density={density} /></dt>
          <dd className="min-w-0 flex-1 basis-32 text-muted-foreground">
            <ScopedMarkdown scope={`symbol:${symbol.id}:meaning`} content={symbol.meaningMarkdown} density={density} />
            {symbol.conditionsMarkdown ? <ScopedMarkdown scope={`symbol:${symbol.id}:conditions`} content={symbol.conditionsMarkdown} density={density} /> : null}
          </dd>
        </div>
      ))}
    </dl>
  );

  if (symbols.length <= COMPACT_SYMBOL_LIMIT) return list;

  return (
    <Collapsible open={open} onOpenChange={setOpen} data-math-symbols-disclosure className="pt-1">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="group inline-flex items-center gap-1.5 rounded-sm py-1 text-body-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-90 motion-reduce:transition-none" />
          <span>{label}</span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent forceMount hidden={!open} className="pt-2">
        {list}
      </CollapsibleContent>
    </Collapsible>
  );
}

// Conservative source estimate; wide notation always retains its own scrollport.
export function isShortArticleFormula(latex: string) {
  return !/\\(?:begin|text|overbrace|underbrace)|[\r\n]|\([^)]*\(/.test(latex)
    && latex.replace(/\\(?:mathbb|mathrm|mathbf|mathit|left|right)\b|[{}\s]/g, "").length < 18;
}

/** Unwraps a single-statement gathered block split only around an implication or relation operator so it flows on one scrollable line. */
export function normalizeSingleStatementFormula(latex: string): string {
  const match = latex.trim().match(/^\\begin\{gathered\}([\s\S]+?)\\end\{gathered\}$/);
  if (!match) return latex;
  const rows = match[1].split("\\\\").map((row) => row.trim()).filter(Boolean);
  if (rows.length === 3 && /^\\(?:Longrightarrow|Longleftarrow|Longleftrightarrow|implies|impliedby|iff|Rightarrow|Leftarrow|Leftrightarrow|to|mapsto|=)$/.test(rows[1])) {
    return `${rows[0]} ${rows[1]} ${rows[2]}`;
  }
  return latex;
}

export function ArticleParts({
  parts,
  visuals = [],
  density,
  staticCodeLabels,
}: {
  parts: ArticlePart[];
  visuals?: PublicVisualSpec[];
  density?: MarkdownDensity;
  staticCodeLabels?: StaticCodeLabels;
}) {
  return (
    <div className={cn("w-full min-w-0 max-w-full", density === "compact" ? "space-y-3" : "space-y-(--paragraph-gap)")} data-article-parts>
      {parts.map((part) => {
        const renderPart = () => {
        if (part.kind === "code_example") return <div key={part.id} id={part.id} data-part-id={part.id} data-part-kind="code_example"><ArticleCodeExample part={part} staticCodeLabels={staticCodeLabels} /></div>;
        if (part.kind === "coding_exercise") return <div key={part.id} id={part.id} data-part-id={part.id} data-part-kind="coding_exercise"><ArticleCodingExercise part={part} /></div>;
        if (part.kind === "markdown") return <div key={part.id} id={part.id} data-part-id={part.id}><InteractiveDocumentArticleLocation partId={part.id} field="markdown"><ScopedMarkdown scope="markdown" content={part.markdown} density={density} /></InteractiveDocumentArticleLocation></div>;
        if (part.kind === "worked_example") return (
          <section key={part.id} id={part.id} data-part-id={part.id} data-part-kind="worked_example" className="space-y-4">
            <h4 className="font-heading text-body-sm font-semibold"><MathText className="normal-case">{part.title}</MathText></h4>
            <ScopedMarkdown scope="problem" content={part.problemMarkdown} density={density} />
            <ol className="relative space-y-6 before:absolute before:bottom-3 before:left-3 before:top-3 before:w-px before:bg-primary/40">
              {part.steps.map((step, index) => <li key={step.id} id={step.id} data-step-id={step.id} className="relative min-w-0 max-w-full space-y-3 pl-9">
                <div className="flex items-start gap-3 font-medium text-foreground"><span className="absolute left-0 flex size-6 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-background text-body-xs font-semibold text-primary">{index + 1}</span><ScopedMarkdown scope={`step:${step.id}:operation`} content={step.operationMarkdown} density={density} /></div>
                <ArticleMarkdownScope id={`step:${step.id}`}><ArticleParts parts={step.parts} visuals={visuals} density={density} staticCodeLabels={staticCodeLabels} /></ArticleMarkdownScope>
                <ScopedMarkdown className="text-muted-foreground" scope={`step:${step.id}:reason`} content={step.reasonMarkdown} density={density} />
                {step.conditionsMarkdown ? <ScopedMarkdown scope={`step:${step.id}:conditions`} content={step.conditionsMarkdown} density={density} /> : null}
              </li>)}
              <li className="relative min-w-0 space-y-3 pl-9 font-semibold">
                <div className="flex items-baseline gap-2"><span className="absolute left-0 flex size-6 items-center justify-center rounded-full border border-primary/40 bg-background text-body-xs text-primary">{part.steps.length + 1}</span><ScopedMarkdown scope="verification" content={part.verificationMarkdown} density={density} /></div>
              </li>
            </ol>
          </section>
        );
        if (part.kind === "math_unit") return (
          <div key={part.id} id={part.id} data-part-id={part.id} data-part-kind="math_unit" data-math-layout={part.layout ?? "statement"} data-math-pair={!part.relations && part.latex && isShortArticleFormula(part.latex) && part.meaningMarkdown.length <= 240 ? "compact" : undefined} className="min-w-0 max-w-full space-y-2">
            {articleCaseLatex(part) ? <div className="min-w-0 max-w-full"><MarkdownRenderer content={`$$\n${articleCaseLatex(part)}\n$$`} density={density} /></div> : null}
            {part.relations ? part.relations.map((relation) => <div key={relation.id} id={relation.id} data-relation-id={relation.id} className={cn("min-w-0 gap-4", part.layout === "comparison" && isShortArticleFormula(relation.latex) ? "grid sm:grid-cols-[minmax(130px,220px)_minmax(0,1fr)] [&+[data-relation-id]]:border-t [&+[data-relation-id]]:border-border/40 [&+[data-relation-id]]:pt-3" : "space-y-2")}>
              {part.layout !== "cases" ? <div className="min-w-0 max-w-full"><MarkdownRenderer content={`$$\n${normalizeSingleStatementFormula(relation.latex)}\n$$`} density={density} /></div> : null}
              <div className="min-w-0 space-y-2"><ScopedMarkdown scope={`relation:${relation.id}:meaning`} content={relation.meaningMarkdown} density={density} />
              {relation.conditionsMarkdown ? <ScopedMarkdown scope={`relation:${relation.id}:conditions`} content={relation.conditionsMarkdown} density={density} /> : null}</div>
            </div>) : <div className="min-w-0 max-w-full"><MarkdownRenderer content={`$$\n${normalizeSingleStatementFormula(part.latex ?? "")}\n$$`} density={density} /></div>}
            <div className={part.relations?.length ? "mt-6 border-t border-border/40 pt-4" : undefined}><ScopedMarkdown scope="meaning" content={part.meaningMarkdown} density={density} /></div>
            {part.conditionsMarkdown ? <div data-math-conditions><ScopedMarkdown scope="conditions" content={part.conditionsMarkdown} density={density} /></div> : null}
            {part.symbolDefinitions?.length ? <MathSymbolDefinitions symbols={part.symbolDefinitions} density={density} /> : null}
          </div>
        );
        const visual = visuals.find((candidate) => candidate.id === part.visualId);
        return visual ? <div key={part.id} id={part.id} data-part-id={part.id} data-part-kind="visual_ref"><InteractiveDocumentArticleLocation partId={part.id} field="visual_ref"><ProductLearningVisual spec={visual} engine="jsxgraph" /></InteractiveDocumentArticleLocation></div> : (
          <p key={part.id} role="status" className="rounded-lg border border-border p-3 text-body-sm text-muted-foreground">Visual belum tersedia.</p>
        );
        };
        return <ArticleMarkdownScope key={part.id} id={part.id}>{renderPart()}</ArticleMarkdownScope>;
      })}
    </div>
  );
}

export { ProductLearningVisual } from "@/components/course/product-learning-visual";
export { ProductWorkedExample } from "@/components/course/product-learning-blocks";
export type { PublicVisualSpec, PublicWorkedExamplePayload } from "@/lib/articles/structured-read-model";
export type { ArticlePart } from "@/lib/materials/article-parts";
