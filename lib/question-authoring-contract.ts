import { z } from "zod";

export const questionTypeSchema = z.enum(["multiple_choice", "multiple_choices", "short_answer", "essay"]);
export const difficultySchema = z.enum(["easy", "medium", "hard"]);
export const cognitiveLevelSchema = z.enum(["remember", "understand", "apply", "analyze", "evaluate", "create"]);
export const questionReviewStatusSchema = z.enum(["generated", "reviewed", "published", "flagged", "retired"]);
export const ideaRoleSchema = z.enum(["primary", "supporting", "required"]);
export const questionReferenceRoleSchema = z.enum(["inspired_by", "adapted_from", "derived_from"]);

export const questionReferenceLinkSchema = z.object({
  referenceQuestionId: z.string().trim().min(1),
  role: questionReferenceRoleSchema,
}).strict();

export const questionIdeaLinkSchema = z.object({
  ideaId: z.string().trim().min(1),
  weight: z.number().finite().gt(0).lte(1),
  role: ideaRoleSchema.default("supporting"),
});

export const questionAuthoringQuestionSchema = z.object({
  knowledgeObjectId: z.string().trim().min(1).nullable().optional(),
  applicationLevel: z.number().int().min(0).max(5).optional(),
  estimatedSteps: z.number().int().positive().optional(),
  difficulty: difficultySchema,
  questionType: questionTypeSchema,
  cognitiveLevel: cognitiveLevelSchema.default("understand"),
  reasoningPattern: z.string().trim().min(1).default("manual_authoring"),
  tags: z.array(z.string().trim().min(1)).default([]),
  prompt: z.string().trim().min(1),
  options: z.array(z.string()).default([]),
  correctIndices: z.array(z.number().int().min(0)).default([]),
  acceptableAnswers: z.array(z.string()).default([]),
  explanation: z.string().default(""),
});

export const questionAuthoringInputSchema = questionAuthoringQuestionSchema.extend({
  courseId: z.string().trim().min(1),
  chapterId: z.string().trim().min(1).nullable().optional(),
  ideaLinks: z.array(questionIdeaLinkSchema).default([]),
  reviewStatus: questionReviewStatusSchema.default("generated"),
});

export type QuestionType = z.infer<typeof questionTypeSchema>;
export type Difficulty = z.infer<typeof difficultySchema>;
export type CognitiveLevel = z.infer<typeof cognitiveLevelSchema>;
export type QuestionReviewStatus = z.infer<typeof questionReviewStatusSchema>;
export type IdeaRole = z.infer<typeof ideaRoleSchema>;
export type QuestionReferenceRole = z.infer<typeof questionReferenceRoleSchema>;
export type QuestionReferenceLink = z.infer<typeof questionReferenceLinkSchema>;
export type QuestionIdeaLink = z.infer<typeof questionIdeaLinkSchema>;
export type QuestionAuthoringQuestion = z.infer<typeof questionAuthoringQuestionSchema>;
export type QuestionAuthoringInput = z.infer<typeof questionAuthoringInputSchema>;

export function canonicalQuestionStatus(reviewStatus: QuestionReviewStatus): "draft" | "in_review" | "published" | "retired" {
  switch (reviewStatus) {
    case "published":
      return "published";
    case "reviewed":
    case "flagged":
      return "in_review";
    case "retired":
      return "retired";
    case "generated":
    default:
      return "draft";
  }
}

export function deterministicQuestionSerialization(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(deterministicQuestionSerialization).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${deterministicQuestionSerialization(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
