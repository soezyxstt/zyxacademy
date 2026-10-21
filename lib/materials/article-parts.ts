import { z } from "zod";
import { inspectPayloadSecurity } from "./visual-contract";

const text = z.string().trim().min(1);
const refs = z.array(text).max(100);
const symbolSchema = z.object({ id: text, latex: text, meaningMarkdown: text, conditionsMarkdown: text.optional() }).strict();
const relationSchema = z.object({ id: text, latex: text, meaningMarkdown: text, conditionsMarkdown: text.optional(), conditionLatex: text.optional() }).strict();
const markdownPartSchema = z.object({ id: text, kind: z.literal("markdown"), markdown: text }).strict();
const mathPartSchema = z.object({
  id: text, kind: z.literal("math_unit"), latex: text.optional(),
  layout: z.enum(["statement", "derivation", "cases", "comparison"]).optional(),
  relations: z.array(relationSchema).min(1).max(30).optional(),
  meaningMarkdown: text, conditionsMarkdown: text.optional(),
  symbolDefinitions: z.array(symbolSchema).max(50).optional(), symbolRefs: refs.optional(),
}).strict().superRefine((part, ctx) => {
  if (Boolean(part.latex) === Boolean(part.relations)) ctx.addIssue({ code: "custom", message: "ARTICLE_MATH_REPRESENTATION_AMBIGUOUS" });
  if (part.layout === "statement" && part.relations && part.relations.length !== 1) ctx.addIssue({ code: "custom", message: "ARTICLE_STATEMENT_RELATION_COUNT" });
  if (part.layout === "cases" && (!part.relations || part.relations.some((relation) => !relation.conditionLatex))) ctx.addIssue({ code: "custom", message: "ARTICLE_CASE_CONDITION_MISSING" });
  const symbols = part.symbolDefinitions ?? [];
  if (new Set(symbols.map((symbol) => symbol.id)).size !== symbols.length) ctx.addIssue({ code: "custom", message: "ARTICLE_SYMBOL_DUPLICATE" });
  if (part.symbolRefs?.some((id) => !symbols.some((symbol) => symbol.id === id))) ctx.addIssue({ code: "custom", message: "ARTICLE_SYMBOL_REF_MISSING" });
});
const visualPartSchema = z.object({ id: text, kind: z.literal("visual_ref"), visualId: text, focusRefs: refs.optional() }).strict();
const leafPartSchema = z.discriminatedUnion("kind", [markdownPartSchema, mathPartSchema, visualPartSchema]);
export const articlePartSchema = z.discriminatedUnion("kind", [
  markdownPartSchema, mathPartSchema, visualPartSchema,
  z.object({
    id: text, kind: z.literal("worked_example"), title: text, problemMarkdown: text,
    steps: z.array(z.object({
      id: text, operationMarkdown: text, reasonMarkdown: text, conditionsMarkdown: text.optional(),
      sourceElementRefs: refs.min(1), parts: z.array(leafPartSchema).min(1).max(30),
    }).strict()).min(1).max(30), verificationMarkdown: text,
  }).strict(),
]);
export type ArticlePart = z.infer<typeof articlePartSchema>;
export function flattenArticleParts(parts: readonly ArticlePart[]): ArticlePart[] {
  return parts.flatMap((part) => part.kind === "worked_example" ? [part, ...part.steps.flatMap((step) => step.parts)] : [part]);
}
export function collectArticlePartIds(parts: readonly ArticlePart[]): string[] {
  return flattenArticleParts(parts).flatMap((part) => [part.id,
    ...(part.kind === "worked_example" ? part.steps.map((step) => step.id) : []),
    ...(part.kind === "math_unit" ? part.relations?.map((relation) => relation.id) ?? [] : []),
  ]);
}
export function collectArticleVisualIds(parts: readonly ArticlePart[]): string[] {
  return [...new Set(flattenArticleParts(parts).flatMap((part) => part.kind === "visual_ref" ? [part.visualId] : []))];
}
export function validateArticlePartReferences(parts: readonly ArticlePart[], visualIds?: readonly string[]): string[] {
  const ids = collectArticlePartIds(parts);
  const errors: string[] = [];
  if (new Set(ids).size !== ids.length) errors.push("ARTICLE_PART_ID_DUPLICATE");
  for (const part of flattenArticleParts(parts)) {
    if (part.kind === "visual_ref") {
      if (visualIds && !visualIds.includes(part.visualId)) errors.push("ARTICLE_PART_VISUAL_MISSING");
      if (part.focusRefs?.some((id) => !ids.includes(id) || id === part.id)) errors.push("ARTICLE_FOCUS_REF_MISSING");
    }
  }
  const available = new Set<string>();
  for (const part of parts) {
    available.add(part.id);
    if (part.kind === "worked_example") {
      for (const step of part.steps) {
        if (step.sourceElementRefs.some((id) => !available.has(id))) errors.push("ARTICLE_STEP_SOURCE_REF_MISSING");
        available.add(step.id);
        collectArticlePartIds(step.parts).forEach((id) => available.add(id));
      }
    } else {
      collectArticlePartIds([part]).forEach((id) => available.add(id));
    }
  }
  return [...new Set(errors)];
}
export const articlePartsSchema = z.array(articlePartSchema).min(1).max(100).superRefine((parts, ctx) => {
  const ids = collectArticlePartIds(parts);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "ARTICLE_PART_ID_DUPLICATE" });
  if (!inspectPayloadSecurity(parts).safe || /data:|!\[[^\]]*\]\(https?:|<script|<iframe/i.test(JSON.stringify(parts))) ctx.addIssue({ code: "custom", message: "ARTICLE_PART_UNSAFE" });
});
export function materializeArticleParts(parts: readonly ArticlePart[]): string {
  return parts.map((part): string => {
    if (part.kind === "markdown") return part.markdown;
    if (part.kind === "visual_ref") return `<!-- visual:${part.visualId} -->`;
    if (part.kind === "worked_example") return [part.title, part.problemMarkdown, ...part.steps.map((step, index) => [
      `### ${index + 1}. ${step.operationMarkdown}`, materializeArticleParts(step.parts), step.reasonMarkdown, step.conditionsMarkdown,
    ].filter(Boolean).join("\n\n")), part.verificationMarkdown].join("\n\n");
    const symbols = part.symbolDefinitions?.map((symbol) => [`$${symbol.latex}$: ${symbol.meaningMarkdown}`, symbol.conditionsMarkdown].filter(Boolean).join(" ")) ?? [];
    const cases = articleCaseLatex(part);
    const relations = part.relations?.map((relation) => [cases ? undefined : `$$\n${relation.latex}\n$$`, relation.meaningMarkdown, relation.conditionsMarkdown].filter(Boolean).join("\n\n")) ?? [`$$\n${part.latex}\n$$`];
    if (cases) relations.unshift(`$$\n${cases}\n$$`);
    return [...symbols, ...relations, part.meaningMarkdown, part.conditionsMarkdown].filter(Boolean).join("\n\n");
  }).join("\n\n");
}


export function articleCaseLatex(part: Extract<ArticlePart, { kind: "math_unit" }>): string | undefined {
  if (part.layout !== "cases" || !part.relations) return undefined;
  return `\\begin{cases}${part.relations.map((relation) => `${relation.latex} & ${relation.conditionLatex}`).join(" \\\\ ")}\\end{cases}`;
}


export function articlePartSearchEntries(parts: readonly ArticlePart[]): { id: string; text: string }[] {
  return parts.flatMap((part): { id: string; text: string }[] => part.kind === "worked_example" ? [
    { id: part.id, text: [part.title, part.problemMarkdown, part.verificationMarkdown].join("\n\n") },
    ...part.steps.flatMap((step) => [
      { id: step.id, text: [step.operationMarkdown, step.reasonMarkdown, step.conditionsMarkdown].filter(Boolean).join("\n\n") },
      ...articlePartSearchEntries(step.parts),
    ]),
  ] : part.kind === "math_unit" && part.relations ? [
    { id: part.id, text: [part.meaningMarkdown, part.conditionsMarkdown, ...part.symbolDefinitions?.map((symbol) => `${symbol.latex}: ${symbol.meaningMarkdown}`) ?? []].filter(Boolean).join("\n\n") },
    ...part.relations.map((relation) => ({ id: relation.id, text: [relation.latex, relation.conditionLatex, relation.meaningMarkdown, relation.conditionsMarkdown].filter(Boolean).join("\n\n") })),
  ] : [{ id: part.id, text: materializeArticleParts([part]) }]);
}
