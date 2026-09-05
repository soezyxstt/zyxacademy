import { z } from "zod";
import {
  formativeCheckPayloadSchema,
  type FormativeCheckPayload,
  sectionPedagogyMetadataSchema,
  type SectionPedagogyMetadata,
  workedExamplePayloadSchema,
  type WorkedExamplePayload,
} from "./pedagogy-contract";
import { visualSpecSchema, type VisualSpec } from "./visual-contract";

export const articleBlockTypeSchema = z.enum([
  "prior_knowledge_activation",
  "problem_introduction",
  "explanation",
  "verbal_representation",
  "mathematical_representation",
  "analogy",
  "worked_example",
  "misconception",
  "application",
  "retrieval_prompt",
  "cross_idea_synthesis",
  "summary",
  "retrieval_close",
]);
export type ArticleBlockType = z.infer<typeof articleBlockTypeSchema>;

export const reviewerStateSchema = z.enum(["draft", "in_review", "approved", "rejected"]);
export type ReviewerState = z.infer<typeof reviewerStateSchema>;

export const inapplicabilityReasonSchema = z.enum([
  "not_mathematical",
  "no_useful_analogy",
  "no_safe_example",
  "no_misconception_identified",
  "not_applicable_to_scope",
]);
export type InapplicabilityReason = z.infer<typeof inapplicabilityReasonSchema>;

export const articleSourceReferenceSchema = z.object({
  sourceId: z.string().min(1),
  version: z.number().int().positive(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/i),
  excerptIds: z.array(z.string().min(1)).min(1),
}).strict();
export type ArticleSourceReference = z.infer<typeof articleSourceReferenceSchema>;

export const articleTraceSchema = z.object({
  ideaIds: z.array(z.string().min(1)),
  sourceRefs: z.array(articleSourceReferenceSchema),
}).strict();
export type ArticleTrace = z.infer<typeof articleTraceSchema>;

export const articleBlockSchema = z
  .object({
    id: z.string().min(1),
    blockType: articleBlockTypeSchema,
    title: z.string().trim().min(1).optional(),
    orderIndex: z.number().int().nonnegative(),
    content: z.string().trim().min(1),
    ideaIds: z.array(z.string().min(1)),
    sourceRefs: z.array(articleSourceReferenceSchema),
    learningPurpose: z.string().trim().min(1),
    generationHash: z.string().regex(/^[a-f0-9]{64}$/i),
    reviewerState: reviewerStateSchema,
    claimRefs: z.array(z.string().min(1)).optional(),
    internalLinks: z.array(z.object({ href: z.string().min(1), targetExists: z.boolean() }).strict()).optional(),
    assets: z.array(z.object({ id: z.string().min(1), available: z.boolean() }).strict()).optional(),
    applicability: z
      .discriminatedUnion("status", [
        z.object({ status: z.literal("applicable") }).strict(),
        z.object({ status: z.literal("inapplicable"), reason: inapplicabilityReasonSchema }).strict(),
      ])
      .default({ status: "applicable" }),
    workedExamplePayload: workedExamplePayloadSchema.optional(),
    formativeCheckPayload: formativeCheckPayloadSchema.optional(),
  })
  .strict()
  .superRefine((block, ctx) => {
    if (block.workedExamplePayload && block.blockType !== "worked_example") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `workedExamplePayload is only allowed on worked_example blocks, found on ${block.blockType}`,
        path: ["workedExamplePayload"],
      });
    }
    if (
      block.formativeCheckPayload &&
      block.blockType !== "retrieval_prompt" &&
      block.blockType !== "retrieval_close"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `formativeCheckPayload is only allowed on retrieval_prompt or retrieval_close blocks, found on ${block.blockType}`,
        path: ["formativeCheckPayload"],
      });
    }
  });
export type ArticleBlock = z.infer<typeof articleBlockSchema>;

export const articleSectionKindSchema = z.enum(["overview", "topic", "summary"]);
export type ArticleSectionKind = z.infer<typeof articleSectionKindSchema>;

export const articleSectionSchema = z.object({
  id: z.string().min(1),
  kind: articleSectionKindSchema,
  learningSectionId: z.string().min(1).optional(),
  parentSectionId: z.string().min(1).optional(),
  title: z.string().trim().min(1),
  slug: z.string().min(1),
  orderIndex: z.number().int().nonnegative(),
  learningObjective: z.string().trim().min(1),
  ideaIds: z.array(z.string().min(1)).min(1),
  sourceRefs: z.array(articleSourceReferenceSchema).min(1),
  blocks: z.array(articleBlockSchema).min(1),
  pedagogy: sectionPedagogyMetadataSchema.optional(),
}).strict();
export type ArticleSection = z.infer<typeof articleSectionSchema>;

export const articleDocumentSchema = z.object({
  id: z.string().min(1),
  courseId: z.string().min(1),
  title: z.string().trim().min(1),
  version: z.number().int().positive(),
  generationHash: z.string().regex(/^[a-f0-9]{64}$/i),
  ideaIds: z.array(z.string().min(1)).min(1),
  blocks: z.array(articleBlockSchema).default([]),
  sections: z.array(articleSectionSchema).default([]),
  visuals: z.array(visualSpecSchema).default([]).optional(),
  reviewerState: reviewerStateSchema,
  ideaVersions: z.record(z.string(), z.number().int().positive()).optional(),
}).strict();
export type ArticleDocument = z.infer<typeof articleDocumentSchema>;

export type {
  FormativeCheckPayload,
  SectionPedagogyMetadata,
  VisualSpec,
  WorkedExamplePayload,
};

export const requiredPerIdeaBlockTypes: readonly ArticleBlockType[] = [
  "explanation",
  "verbal_representation",
  "mathematical_representation",
  "analogy",
  "worked_example",
  "misconception",
  "application",
  "retrieval_prompt",
];

export const requiredDocumentBlockTypes: readonly ArticleBlockType[] = [
  "prior_knowledge_activation",
  "problem_introduction",
  "summary",
  "retrieval_close",
];

export const optionalPerIdeaBlockTypes = new Set<ArticleBlockType>([
  "mathematical_representation",
  "analogy",
  "worked_example",
  "misconception",
]);

export type ArticleBlockInput = Omit<ArticleBlock, "orderIndex"> & { orderIndex?: number };

export function normalizeArticleBlockType(value: string): ArticleBlockType | null {
  const aliases: Record<string, ArticleBlockType> = {
    prior_knowledge: "prior_knowledge_activation",
    prior_knowledge_activation: "prior_knowledge_activation",
    problem: "problem_introduction",
    problem_introduction: "problem_introduction",
    explanation: "explanation",
    verbal: "verbal_representation",
    verbal_representation: "verbal_representation",
    mathematical: "mathematical_representation",
    mathematical_representation: "mathematical_representation",
    analogy: "analogy",
    worked_example: "worked_example",
    example: "worked_example",
    misconception: "misconception",
    application: "application",
    retrieval_prompt: "retrieval_prompt",
    synthesis: "cross_idea_synthesis",
    cross_idea_synthesis: "cross_idea_synthesis",
    summary: "summary",
    retrieval_close: "retrieval_close",
  };
  return aliases[value.trim().toLowerCase()] ?? null;
}

export function canonicalArticleBlockOrder(blocks: readonly ArticleBlock[]): ArticleBlock[] {
  return [...blocks]
    .sort((left, right) => left.orderIndex - right.orderIndex || left.id.localeCompare(right.id))
    .map((block, orderIndex) => ({ ...block, orderIndex }));
}

export function canonicalArticleSectionOrder(sections: readonly ArticleSection[]): ArticleSection[] {
  return [...sections]
    .sort((left, right) => left.orderIndex - right.orderIndex || left.id.localeCompare(right.id))
    .map((section, orderIndex) => ({
      ...section,
      orderIndex,
      blocks: canonicalArticleBlockOrder(section.blocks),
    }));
}
