"use client";

import type { ComponentProps } from "react";
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
    <div className="w-full min-w-0 max-w-full space-y-5" data-article-parts>
      {parts.map((part) => {
        const renderPart = () => {
        if (part.kind === "code_example") return <div key={part.id} id={part.id} data-part-id={part.id} data-part-kind="code_example"><ArticleCodeExample part={part} staticCodeLabels={staticCodeLabels} /></div>;
        if (part.kind === "coding_exercise") return <div key={part.id} id={part.id} data-part-id={part.id} data-part-kind="coding_exercise"><ArticleCodingExercise part={part} /></div>;
        if (part.kind === "markdown") return <div key={part.id} id={part.id} data-part-id={part.id}><InteractiveDocumentArticleLocation partId={part.id} field="markdown"><ScopedMarkdown scope="markdown" content={part.markdown} density={density} /></InteractiveDocumentArticleLocation></div>;
        if (part.kind === "worked_example") return (
          <section key={part.id} id={part.id} data-part-id={part.id} data-part-kind="worked_example" className="space-y-5">
            <h4 className="font-heading text-body-base font-bold"><MathText className="normal-case">{part.title}</MathText></h4>
            <ScopedMarkdown scope="problem" content={part.problemMarkdown} density={density} />
            <ol className="space-y-6">
              {part.steps.map((step, index) => <li key={step.id} id={step.id} data-step-id={step.id} className="min-w-0 max-w-full space-y-3 border-l-2 border-primary/40 pl-4">
                <div className="flex items-baseline gap-2"><span className="text-body-sm text-muted-foreground">{index + 1}.</span><ScopedMarkdown scope={`step:${step.id}:operation`} content={step.operationMarkdown} density={density} /></div>
                <ArticleMarkdownScope id={`step:${step.id}`}><ArticleParts parts={step.parts} visuals={visuals} density={density} staticCodeLabels={staticCodeLabels} /></ArticleMarkdownScope>
                <ScopedMarkdown scope={`step:${step.id}:reason`} content={step.reasonMarkdown} density={density} />
                {step.conditionsMarkdown ? <ScopedMarkdown scope={`step:${step.id}:conditions`} content={step.conditionsMarkdown} density={density} /> : null}
              </li>)}
            </ol>
            <ScopedMarkdown scope="verification" content={part.verificationMarkdown} density={density} />
          </section>
        );
        if (part.kind === "math_unit") return (
          <div key={part.id} id={part.id} data-part-id={part.id} data-part-kind="math_unit" data-math-layout={part.layout ?? "statement"} className="min-w-0 max-w-full space-y-3 border-l-2 border-primary/40 pl-4">
            {part.symbolDefinitions?.length ? <dl className="space-y-2">{part.symbolDefinitions.map((symbol) => <div key={symbol.id} data-symbol-id={symbol.id} className="flex flex-wrap items-baseline gap-x-2">
              <dt><MarkdownRenderer content={`$${symbol.latex}$`} density={density} /></dt>
              <dd className="min-w-0 flex-1 basis-48"><ScopedMarkdown scope={`symbol:${symbol.id}:meaning`} content={symbol.meaningMarkdown} density={density} />{symbol.conditionsMarkdown ? <ScopedMarkdown scope={`symbol:${symbol.id}:conditions`} content={symbol.conditionsMarkdown} density={density} /> : null}</dd>
            </div>)}</dl> : null}
            {articleCaseLatex(part) ? <div className="min-w-0 overflow-x-auto"><MarkdownRenderer content={`$$\n${articleCaseLatex(part)}\n$$`} density={density} /></div> : null}
            {part.relations ? part.relations.map((relation) => <div key={relation.id} id={relation.id} data-relation-id={relation.id} className="space-y-2">
              {part.layout !== "cases" ? <div className="min-w-0 overflow-x-auto"><MarkdownRenderer content={`$$\n${relation.latex}\n$$`} density={density} /></div> : null}
              <ScopedMarkdown scope={`relation:${relation.id}:meaning`} content={relation.meaningMarkdown} density={density} />
              {relation.conditionsMarkdown ? <ScopedMarkdown scope={`relation:${relation.id}:conditions`} content={relation.conditionsMarkdown} density={density} /> : null}
            </div>) : <div className="min-w-0 overflow-x-auto"><MarkdownRenderer content={`$$\n${part.latex}\n$$`} density={density} /></div>}
            <ScopedMarkdown scope="meaning" content={part.meaningMarkdown} density={density} />
            {part.conditionsMarkdown ? <ScopedMarkdown scope="conditions" content={part.conditionsMarkdown} density={density} /> : null}
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
