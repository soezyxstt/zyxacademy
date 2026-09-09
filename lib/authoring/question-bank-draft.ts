import { z } from "zod";
import {
  questionAuthoringQuestionSchema,
  questionIdeaLinkSchema,
  questionReferenceLinkSchema,
  type QuestionAuthoringQuestion,
  type QuestionIdeaLink,
  type QuestionReferenceLink,
} from "@/lib/question-authoring-contract";

const questionIdSchema = z.string().trim().min(1).max(160);

const legacyQuizQuestionSchema = z.object({
  id: questionIdSchema,
  knowledgeObjectId: z.string().trim().min(1),
  itemFormat: z.enum(["multiple_choice", "multiple_choices"]),
  prompt: z.string().trim().min(1),
  options: z.array(z.string().min(1)),
  correctIndices: z.array(z.number().int().nonnegative()),
  explanation: z.string().min(1),
  difficulty: z.enum(["easy", "medium", "hard"]),
  cognitiveLevel: z.enum(["remember", "understand", "apply", "analyze", "evaluate", "create"]),
  reasoningPattern: z.string().trim().min(1),
  tags: z.array(z.string()).default([]),
  acceptableAnswers: z.array(z.string()).default([]),
  applicationLevel: z.number().int().min(0).max(5).optional(),
  estimatedSteps: z.number().int().positive().optional(),
}).strict();

const questionBankQuestionSchema = questionAuthoringQuestionSchema.extend({
  id: questionIdSchema,
  ideaLinks: z.array(questionIdeaLinkSchema).default([]),
  referenceLinks: z.array(questionReferenceLinkSchema).default([]),
}).strict();

const legacyQuizDraftSchema = z.object({
  schemaVersion: z.literal("quiz-bank-draft.v1"),
  draftId: questionIdSchema,
  questions: z.array(legacyQuizQuestionSchema).min(1).max(500),
}).strict();

const questionBankDraftV2Schema = z.object({
  schemaVersion: z.literal("question-bank-draft.v2"),
  draftId: questionIdSchema,
  questions: z.array(questionBankQuestionSchema).min(1).max(500),
}).strict();

export const questionBankDraftSchema = z.discriminatedUnion("schemaVersion", [
  legacyQuizDraftSchema,
  questionBankDraftV2Schema,
]);

export type QuestionBankDraft = z.infer<typeof questionBankDraftSchema>;

export type NormalizedQuestionBankDraftItem = {
  externalId: string;
  question: QuestionAuthoringQuestion;
  ideaLinks: QuestionIdeaLink[];
  referenceLinks: QuestionReferenceLink[];
};

export type NormalizedQuestionBankDraft = {
  schemaVersion: QuestionBankDraft["schemaVersion"];
  draftId: string;
  items: NormalizedQuestionBankDraftItem[];
};

export function parseQuestionBankDraftJson(draftJson: string):
  | { success: true; data: QuestionBankDraft }
  | { success: false; issues: Array<{ code: string; message: string; path?: string }> } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(draftJson);
  } catch {
    return { success: false, issues: [{ code: "QUESTION_BANK_DRAFT_INVALID_JSON", message: "Draft JSON tidak valid." }] };
  }
  const result = questionBankDraftSchema.safeParse(parsed);
  if (!result.success) {
    return {
      success: false,
      issues: result.error.issues.map((issue) => ({
        code: "QUESTION_BANK_DRAFT_SCHEMA_INVALID",
        message: issue.message,
        path: issue.path.join("."),
      })),
    };
  }
  return { success: true, data: result.data };
}

export function normalizeQuestionBankDraft(draft: QuestionBankDraft): NormalizedQuestionBankDraft {
  if (draft.schemaVersion === "quiz-bank-draft.v1") {
    return {
      schemaVersion: draft.schemaVersion,
      draftId: draft.draftId,
      items: draft.questions.map((question) => ({
        externalId: question.id,
        ideaLinks: [],
        referenceLinks: [],
        question: {
          knowledgeObjectId: question.knowledgeObjectId,
          applicationLevel: question.applicationLevel,
          estimatedSteps: question.estimatedSteps,
          difficulty: question.difficulty,
          questionType: question.itemFormat,
          cognitiveLevel: question.cognitiveLevel,
          reasoningPattern: question.reasoningPattern,
          tags: question.tags,
          prompt: question.prompt,
          options: question.options,
          correctIndices: question.correctIndices,
          acceptableAnswers: question.acceptableAnswers,
          explanation: question.explanation,
        },
      })),
    };
  }

  return {
    schemaVersion: draft.schemaVersion,
    draftId: draft.draftId,
    items: draft.questions.map(({ id, ideaLinks, referenceLinks, ...question }) => ({
      externalId: id,
      ideaLinks,
      referenceLinks,
      question,
    })),
  };
}
