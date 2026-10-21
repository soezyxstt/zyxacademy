"use client";

import { articleCaseLatex, type ArticlePart } from "@/lib/materials/article-parts";
import type { PublicVisualSpec } from "@/lib/articles/structured-read-model";
import { MathText } from "@/components/course/math-text";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { ProductLearningVisual } from "@/components/course/product-learning-visual";

export function ArticleParts({ parts, visuals = [] }: { parts: ArticlePart[]; visuals?: PublicVisualSpec[] }) {
  return (
    <div className="space-y-5" data-article-parts>
      {parts.map((part) => {
        if (part.kind === "markdown") return <div key={part.id} id={part.id} data-part-id={part.id}><MarkdownRenderer content={part.markdown} /></div>;
        if (part.kind === "worked_example") return (
          <section key={part.id} id={part.id} data-part-id={part.id} data-part-kind="worked_example" className="space-y-5">
            <h4 className="font-heading text-body-base font-bold"><MathText className="normal-case">{part.title}</MathText></h4>
            <MarkdownRenderer content={part.problemMarkdown} />
            <ol className="space-y-6">
              {part.steps.map((step, index) => <li key={step.id} id={step.id} data-step-id={step.id} className="space-y-3 border-l-2 border-primary/40 pl-4">
                <div className="flex items-baseline gap-2"><span className="text-body-sm text-muted-foreground">{index + 1}.</span><MarkdownRenderer content={step.operationMarkdown} /></div>
                <ArticleParts parts={step.parts} visuals={visuals} />
                <MarkdownRenderer content={step.reasonMarkdown} />
                {step.conditionsMarkdown ? <MarkdownRenderer content={step.conditionsMarkdown} /> : null}
              </li>)}
            </ol>
            <MarkdownRenderer content={part.verificationMarkdown} />
          </section>
        );
        if (part.kind === "math_unit") return (
          <div key={part.id} id={part.id} data-part-id={part.id} data-part-kind="math_unit" data-math-layout={part.layout ?? "statement"} className="space-y-3 border-l-2 border-primary/40 pl-4">
            {part.symbolDefinitions?.length ? <dl className="space-y-2">{part.symbolDefinitions.map((symbol) => <div key={symbol.id} data-symbol-id={symbol.id} className="flex flex-wrap items-baseline gap-x-2">
              <dt><MarkdownRenderer content={`$${symbol.latex}$`} /></dt>
              <dd><MarkdownRenderer content={symbol.meaningMarkdown} />{symbol.conditionsMarkdown ? <MarkdownRenderer content={symbol.conditionsMarkdown} /> : null}</dd>
            </div>)}</dl> : null}
            {articleCaseLatex(part) ? <div className="min-w-0 overflow-x-auto"><MarkdownRenderer content={`$$\n${articleCaseLatex(part)}\n$$`} /></div> : null}
            {part.relations ? part.relations.map((relation) => <div key={relation.id} id={relation.id} data-relation-id={relation.id} className="space-y-2">
              {part.layout !== "cases" ? <div className="min-w-0 overflow-x-auto"><MarkdownRenderer content={`$$\n${relation.latex}\n$$`} /></div> : null}
              <MarkdownRenderer content={relation.meaningMarkdown} />
              {relation.conditionsMarkdown ? <MarkdownRenderer content={relation.conditionsMarkdown} /> : null}
            </div>) : <div className="min-w-0 overflow-x-auto"><MarkdownRenderer content={`$$\n${part.latex}\n$$`} /></div>}
            <MarkdownRenderer content={part.meaningMarkdown} />
            {part.conditionsMarkdown ? <MarkdownRenderer content={part.conditionsMarkdown} /> : null}
          </div>
        );
        const visual = visuals.find((candidate) => candidate.id === part.visualId);
        return visual ? <div key={part.id} id={part.id} data-part-id={part.id} data-part-kind="visual_ref"><ProductLearningVisual spec={visual} engine="jsxgraph" /></div> : (
          <p key={part.id} role="status" className="rounded-lg border border-border p-3 text-body-sm text-muted-foreground">Visual belum tersedia.</p>
        );
      })}
    </div>
  );
}
