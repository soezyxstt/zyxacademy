import { z } from "zod";
import {
  articlePartSchema,
  articlePartsSchema,
  collectArticlePartIds,
  flattenArticleParts,
  validateArticlePartReferences,
  type ArticlePart,
} from "./article-parts";
import { inspectPayloadSecurity, visualSpecSchema } from "./visual-contract";

const text = z.string().trim().min(1).max(20_000);
const id = z.string().trim().min(1).max(100);
// Reuse the article variants and its array-level checks, while expressing the
// collection's static-only code restriction in the published JSON Schema too.
const [markdownPart, mathPart, visualPart, workedPart, codePart, codingPart] = articlePartSchema.options;
const solutionPartSchema = z.discriminatedUnion("kind", [
  markdownPart, mathPart, visualPart, workedPart,
  codePart.extend({ runnable: z.literal(false, { error: "SOLUTION_RUNNABLE_CODE_EXAMPLE_FORBIDDEN: solution collection code examples must set runnable to false" }) }),
  codingPart,
]);
const content = z.array(solutionPartSchema).min(1).max(100).superRefine((parts, ctx) => {
  const result = articlePartsSchema.safeParse(parts);
  if (!result.success) result.error.issues.forEach((issue) => ctx.addIssue({ code: "custom", path: issue.path, message: issue.message }));
}).describe("Solution collection content allows static code examples only. Every code_example must explicitly set runnable to false. coding_exercise references and embedded article payloads are forbidden.");

export const solutionQuestionTypeSchema = z.enum([
  "single_choice", "multiple_choice", "numeric", "short_answer", "essay", "programming",
]);
export const solutionDisciplineSchema = z.enum([
  "mathematics", "natural_science", "social_science", "language", "computer_science", "other",
]);
export const solutionTemplateSchema = z.enum([
  "choice", "calculation", "conceptual", "code_trace", "code_construction",
]);

export const solutionProvenanceSchema = z.object({
  kind: z.enum(["original", "adapted", "reproduced"]),
  attribution: text,
  sources: z.array(z.object({
    title: text,
    locator: text,
    url: z.url().refine((value) => {
      try { return new URL(value).protocol === "https:"; } catch { return false; }
    }, "Source URL must use HTTPS").optional(),
  }).strict()).max(20),
}).strict().superRefine((provenance, ctx) => {
  if (provenance.kind !== "original" && provenance.sources.length === 0) {
    ctx.addIssue({ code: "custom", path: ["sources"], message: "SOLUTION_SOURCE_REQUIRED" });
  }
});

const optionSchema = z.object({ id, parts: content }).strict();
const stepSchema = z.object({
  id,
  operationMarkdown: text,
  reasonMarkdown: text,
  conditionsMarkdown: text.optional(),
  parts: content.optional(),
}).strict();
const misconceptionSchema = z.object({ id, misconceptionMarkdown: text, correctionMarkdown: text }).strict();

export const solutionCollectionItemSchema = z.object({
  id,
  title: text,
  questionType: solutionQuestionTypeSchema,
  discipline: solutionDisciplineSchema,
  template: solutionTemplateSchema,
  prompt: content,
  options: z.array(optionSchema).max(20),
  answer: z.object({ parts: content, optionIds: z.array(id).max(20) }).strict(),
  hintMarkdown: z.string().trim().min(1).max(1200).describe("Optional short, spoiler-free starting clue. Name a useful concept or first move without the final answer, correct option, full derivation or solution code. The reasoning reviewer must verify this independently of strategy.").optional(),
  strategy: content,
  steps: z.array(stepSchema).min(1).max(50),
  verification: content,
  misconceptions: z.array(misconceptionSchema).max(20).optional(),
  visuals: z.array(visualSpecSchema).max(50),
  provenance: z.object({ problem: solutionProvenanceSchema, solution: solutionProvenanceSchema }).strict(),
}).strict();

const compatibleTemplates: Record<z.infer<typeof solutionQuestionTypeSchema>, readonly z.infer<typeof solutionTemplateSchema>[]> = {
  single_choice: ["choice", "conceptual", "calculation", "code_trace"],
  multiple_choice: ["choice", "conceptual", "code_trace"],
  numeric: ["calculation", "code_trace"],
  short_answer: ["conceptual", "calculation", "code_trace"],
  essay: ["conceptual", "code_construction"],
  programming: ["code_trace", "code_construction"],
};

function itemParts(item: z.infer<typeof solutionCollectionItemSchema>): ArticlePart[] {
  return [
    ...item.prompt,
    ...item.options.flatMap((option) => option.parts),
    ...item.answer.parts,
    ...item.strategy,
    ...item.steps.flatMap((step) => step.parts ?? []),
    ...item.verification,
  ];
}

/** A released, independently authored learning product. It is not a question-bank snapshot. */
export const solutionCollectionSchema = z.object({
  schemaVersion: z.literal("solution_collection.v1"),
  productType: z.literal("solution_collection"),
  release: z.literal("released_learning_content"),
  id,
  title: text,
  course: z.object({ id, title: text }).strict(),
  chapter: z.object({ id, title: text }).strict(),
  items: z.array(solutionCollectionItemSchema).max(500),
}).strict().superRefine((collection, ctx) => {
  const allIds: string[] = [collection.id];
  const fail = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
  // MarkdownRenderer also understands embedded Article payloads and visual fences.
  // They would bypass this contract's reference and private-coding checks.
  if (/<!--__ZYX_V4_|(?:`{3,}|~{3,})\s*zyx-visual\b/i.test(JSON.stringify(collection))) {
    fail([], "SOLUTION_EMBEDDED_PAYLOAD_FORBIDDEN");
  }
  collection.items.forEach((item, index) => {
    const path = ["items", index];
    const parts = itemParts(item);
    const flattened = flattenArticleParts(parts);
    allIds.push(item.id, ...item.options.map((option) => option.id), ...item.steps.map((step) => step.id),
      ...(item.misconceptions ?? []).map((misconception) => misconception.id), ...item.visuals.map((visual) => visual.id),
      ...collectArticlePartIds(parts),
      ...flattened.flatMap((part) => part.kind === "math_unit" ? (part.symbolDefinitions ?? []).map((symbol) => symbol.id) : []));

    if (!compatibleTemplates[item.questionType].includes(item.template)) fail([...path, "template"], "SOLUTION_TEMPLATE_TYPE_MISMATCH");
    if ((item.template === "code_trace" || item.template === "code_construction") && item.discipline !== "computer_science") {
      fail([...path, "discipline"], "SOLUTION_CODE_DISCIPLINE_MISMATCH");
    }
    const isChoice = item.questionType === "single_choice" || item.questionType === "multiple_choice";
    const answerIds = item.answer.optionIds;
    if (isChoice && item.options.length < 2) fail([...path, "options"], "SOLUTION_CHOICE_OPTIONS_REQUIRED");
    if (!isChoice && (item.options.length || answerIds.length)) fail(path, "SOLUTION_OPTIONS_NOT_APPLICABLE");
    if (isChoice && (answerIds.length === 0 || (item.questionType === "single_choice" && answerIds.length !== 1))) {
      fail([...path, "answer", "optionIds"], "SOLUTION_ANSWER_OPTION_COUNT");
    }
    if (new Set(answerIds).size !== answerIds.length || answerIds.some((answerId) => !item.options.some((option) => option.id === answerId))) {
      fail([...path, "answer", "optionIds"], "SOLUTION_ANSWER_OPTION_INVALID");
    }
    for (const error of validateArticlePartReferences(parts, item.visuals.map((visual) => visual.id))) fail(path, error);
    if (flattened.some((part) => part.kind === "coding_exercise")) fail(path, "SOLUTION_PRIVATE_CODING_REFERENCE_FORBIDDEN");
    if (item.hintMarkdown && /```|~~~|<\/?[a-z]|!\[|<!--/i.test(item.hintMarkdown)) fail([...path, "hintMarkdown"], "SOLUTION_HINT_TEXT_ONLY");
    const authoredText = [item.steps, item.misconceptions ?? [], item.hintMarkdown ?? ""];
    if (!inspectPayloadSecurity(authoredText).safe || /data:|!\[[^\]]*\]\(https?:|<script|<iframe/i.test(JSON.stringify(authoredText))) {
      fail(path, "SOLUTION_CONTENT_UNSAFE");
    }
  });
  if (new Set(allIds).size !== allIds.length) fail(["items"], "SOLUTION_ID_DUPLICATE");
});

export type SolutionCollection = z.infer<typeof solutionCollectionSchema>;
export type SolutionCollectionInput = z.input<typeof solutionCollectionSchema>;
export type SolutionCollectionItem = z.infer<typeof solutionCollectionItemSchema>;
export type SolutionQuestionType = z.infer<typeof solutionQuestionTypeSchema>;
export type SolutionDiscipline = z.infer<typeof solutionDisciplineSchema>;
export type SolutionTemplate = z.infer<typeof solutionTemplateSchema>;
export type SolutionProvenance = z.infer<typeof solutionProvenanceSchema>;

export function parseSolutionCollection(input: unknown): SolutionCollection {
  return solutionCollectionSchema.parse(input);
}

export function validateSolutionCollection(input: unknown) {
  return solutionCollectionSchema.safeParse(input);
}
