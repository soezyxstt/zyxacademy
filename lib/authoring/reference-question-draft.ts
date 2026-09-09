import { z } from "zod";
import { questionIdeaLinkSchema, questionTypeSchema, difficultySchema, cognitiveLevelSchema, type QuestionIdeaLink } from "@/lib/question-authoring-contract";

export const referenceAssessmentTypeSchema = z.enum(["uts", "uas", "quiz", "tutorial", "homework", "exercise", "other"]);
export const referenceAnswerProvenanceSchema = z.enum(["official", "source_solution", "zyx_generated", "unavailable"]);
export const referenceLinkRoleSchema = z.enum(["inspired_by", "adapted_from", "derived_from"]);

const nullableYear = z.number().int().min(1900).max(2100).nullable().default(null);

export const referenceQuestionSourceSchema = z.object({
  sourceFileKey: z.string().trim().min(1),
  solutionFileKey: z.string().trim().min(1).nullable().default(null),
  institution: z.string().trim().min(1).max(160),
  assessmentType: referenceAssessmentTypeSchema,
  year: nullableYear,
  academicYearLabel: z.string().trim().min(1).max(80).nullable().default(null),
  term: z.string().trim().min(1).max(80).nullable().default(null),
  title: z.string().trim().min(1).max(300),
}).strict();

export const referenceQuestionSchema = z.object({
  localId: z.string().trim().min(1).max(160),
  questionNumber: z.string().trim().min(1).max(80),
  part: z.string().trim().min(1).max(80).nullable().default(null),
  page: z.number().int().positive(),
  prompt: z.string().trim().min(1),
  questionType: questionTypeSchema,
  options: z.array(z.string().trim().min(1)).default([]),
  correctIndices: z.array(z.number().int().nonnegative()).default([]),
  acceptableAnswers: z.array(z.string().trim().min(1)).default([]),
  answerProvenance: referenceAnswerProvenanceSchema,
  solutionProvenance: referenceAnswerProvenanceSchema,
  difficulty: difficultySchema,
  cognitiveLevel: cognitiveLevelSchema,
  ideaLinks: z.array(questionIdeaLinkSchema).min(1).max(50),
  quizEligible: z.boolean().default(false),
}).strict();

export const referenceQuestionDraftSchema = z.object({
  schemaVersion: z.literal("reference-question-draft.v1"),
  source: referenceQuestionSourceSchema,
  questions: z.array(referenceQuestionSchema).min(1).max(500),
}).strict();

export type ReferenceQuestionDraft = z.infer<typeof referenceQuestionDraftSchema>;
export type ReferenceQuestionSource = z.infer<typeof referenceQuestionSourceSchema>;
export type ReferenceQuestion = z.infer<typeof referenceQuestionSchema>;

export type ReferenceSourceMetadata = {
  category: "soal" | "pembahasan_soal";
  title: string;
  subcategory: string | null;
  year: number | null;
  checksum: string | null;
  pageCount?: number | null;
  fileKey: string;
  /** Extracted source text is returned only by the single-file resolver, never by the catalog. */
  extractedText?: string | null;
};

export type ReferenceIdeaRow = {
  id: string;
  courseId: string;
  chapterId: string | null;
  status: string;
};

export type ReferenceDraftIssue = {
  code: string;
  message: string;
  path?: string;
};

export type ReferenceDraftValidationContext = {
  courseId: string;
  source: ReferenceSourceMetadata;
  solution: ReferenceSourceMetadata | null;
  ideas: ReadonlyMap<string, ReferenceIdeaRow>;
};

function issue(code: string, message: string, path?: string): ReferenceDraftIssue {
  return { code, message, ...(path ? { path } : {}) };
}

function hasEvaluableAnswer(question: ReferenceQuestion): boolean {
  if (question.questionType === "multiple_choice" || question.questionType === "multiple_choices") {
    return question.options.length >= 2
      && question.correctIndices.length > 0
      && new Set(question.correctIndices).size === question.correctIndices.length
      && question.correctIndices.every((index) => index >= 0 && index < question.options.length);
  }
  if (question.questionType === "short_answer") return question.acceptableAnswers.length > 0;
  return false;
}

export function parseReferenceQuestionDraftJson(draftJson: string):
  | { success: true; data: ReferenceQuestionDraft }
  | { success: false; issues: ReferenceDraftIssue[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(draftJson);
  } catch {
    return { success: false, issues: [issue("REFERENCE_DRAFT_INVALID_JSON", "Draft JSON tidak valid.")] };
  }
  const result = referenceQuestionDraftSchema.safeParse(parsed);
  if (!result.success) {
    return {
      success: false,
      issues: result.error.issues.map((entry) => issue("REFERENCE_DRAFT_SCHEMA_INVALID", entry.message, entry.path.join("."))),
    };
  }
  return { success: true, data: result.data };
}

export function validateReferenceQuestionDraft(
  draft: ReferenceQuestionDraft,
  context: ReferenceDraftValidationContext,
): { valid: boolean; issues: ReferenceDraftIssue[]; questionCount: number; eligibleCount: number } {
  const issues: ReferenceDraftIssue[] = [];
  if (context.source.category !== "soal") issues.push(issue("HISTORICAL_SOURCE_CATEGORY_INVALID", "Source utama harus berada pada kategori soal.", "source.sourceFileKey"));
  if (context.source.fileKey !== draft.source.sourceFileKey) issues.push(issue("HISTORICAL_SOURCE_FILE_MISMATCH", "Source file pada draft tidak sama dengan source file yang telah di-resolve.", "source.sourceFileKey"));
  if (context.source.title !== draft.source.title) issues.push(issue("HISTORICAL_SOURCE_TITLE_MISMATCH", "Judul source pada draft tidak sama dengan metadata source.", "source.title"));
  if (context.source.pageCount !== undefined && context.source.pageCount !== null && (!Number.isInteger(context.source.pageCount) || context.source.pageCount < 1)) {
    issues.push(issue("HISTORICAL_SOURCE_PAGE_COUNT_INVALID", "Jumlah halaman source harus berupa bilangan bulat positif.", "source.sourceFileKey"));
  }
  if (context.solution && context.solution.category !== "pembahasan_soal") issues.push(issue("HISTORICAL_SOLUTION_CATEGORY_INVALID", "Source pembahasan harus berada pada kategori pembahasan_soal.", "source.solutionFileKey"));
  if (draft.source.solutionFileKey && !context.solution) issues.push(issue("HISTORICAL_SOLUTION_FILE_NOT_FOUND", "Source pembahasan tidak ditemukan dalam scope course.", "source.solutionFileKey"));
  if (draft.source.solutionFileKey && context.solution && context.solution.fileKey !== draft.source.solutionFileKey) {
    issues.push(issue("HISTORICAL_SOLUTION_FILE_MISMATCH", "Source pembahasan pada draft tidak sama dengan source pembahasan yang telah di-resolve.", "source.solutionFileKey"));
  }
  if (draft.source.solutionFileKey && context.solution && context.solution.fileKey === context.source.fileKey) issues.push(issue("HISTORICAL_SOURCE_FILES_MUST_DIFFER", "File soal dan pembahasan harus berbeda.", "source.solutionFileKey"));

  const seenLocalIds = new Set<string>();
  let eligibleCount = 0;
  for (const [index, question] of draft.questions.entries()) {
    const path = `questions[${index}]`;
    if (seenLocalIds.has(question.localId)) issues.push(issue("HISTORICAL_DUPLICATE_LOCAL_ID", `localId ${question.localId} digunakan lebih dari sekali.`, `${path}.localId`));
    seenLocalIds.add(question.localId);
    if (context.source.pageCount !== undefined && context.source.pageCount !== null && question.page > context.source.pageCount) {
      issues.push(issue("HISTORICAL_PAGE_OUT_OF_RANGE", `Halaman ${question.page} melebihi jumlah halaman source.`, `${path}.page`));
    }
    const ideaIds = question.ideaLinks.map((link) => link.ideaId);
    if (new Set(ideaIds).size !== ideaIds.length) issues.push(issue("HISTORICAL_DUPLICATE_IDEA", "Idea yang sama tidak boleh dipilih lebih dari sekali.", `${path}.ideaLinks`));
    const weightSum = question.ideaLinks.reduce((sum, link) => sum + link.weight, 0);
    if (Math.abs(weightSum - 1) > 0.000001) issues.push(issue("HISTORICAL_IDEA_WEIGHT_INVALID", "Total bobot Idea harus sama dengan 1.", `${path}.ideaLinks`));
    for (const [linkIndex, link] of question.ideaLinks.entries()) {
      const idea = context.ideas.get(link.ideaId);
      if (!idea) issues.push(issue("HISTORICAL_IDEA_NOT_FOUND", `Idea ${link.ideaId} tidak ditemukan dalam course yang dikunci.`, `${path}.ideaLinks[${linkIndex}]`));
      else if (idea.courseId !== context.courseId) issues.push(issue("HISTORICAL_IDEA_COURSE_MISMATCH", `Idea ${link.ideaId} berasal dari course lain.`, `${path}.ideaLinks[${linkIndex}]`));
      else if (idea.status !== "published") issues.push(issue("HISTORICAL_IDEA_NOT_PUBLISHED", `Idea ${link.ideaId} belum published.`, `${path}.ideaLinks[${linkIndex}]`));
    }

    if (question.answerProvenance === "source_solution" && !draft.source.solutionFileKey) {
      issues.push(issue("HISTORICAL_PROVENANCE_SOURCE_MISSING", "answerProvenance source_solution membutuhkan solutionFileKey.", `${path}.answerProvenance`));
    }
    if (question.solutionProvenance === "source_solution" && !draft.source.solutionFileKey) {
      issues.push(issue("HISTORICAL_PROVENANCE_SOURCE_MISSING", "solutionProvenance source_solution membutuhkan solutionFileKey.", `${path}.solutionProvenance`));
    }
    if (question.answerProvenance === "official" && !hasEvaluableAnswer(question) && question.questionType !== "essay") {
      issues.push(issue("HISTORICAL_OFFICIAL_ANSWER_MISSING", "Answer official harus memiliki jawaban yang dapat diverifikasi.", `${path}.answerProvenance`));
    }
    if (question.quizEligible) {
      if (question.questionType === "essay") issues.push(issue("HISTORICAL_ESSAY_NOT_QUIZ_ELIGIBLE", "Soal essay tidak dapat ditandai quizEligible.", `${path}.quizEligible`));
      else if (question.answerProvenance === "unavailable") issues.push(issue("HISTORICAL_QUIZ_PROVENANCE_INVALID", "Soal quizEligible harus memiliki provenance jawaban yang tersedia.", `${path}.answerProvenance`));
      else if (!hasEvaluableAnswer(question)) issues.push(issue("HISTORICAL_QUIZ_ELIGIBILITY_INVALID", "Soal quizEligible harus memiliki kunci jawaban yang dapat dinilai.", `${path}.quizEligible`));
      else eligibleCount += 1;
    }
    if (question.correctIndices.some((answerIndex) => answerIndex >= question.options.length)) {
      issues.push(issue("HISTORICAL_ANSWER_INDEX_INVALID", "Indeks jawaban berada di luar options.", `${path}.correctIndices`));
    }
  }

  return { valid: issues.length === 0, issues, questionCount: draft.questions.length, eligibleCount };
}

export function toQuestionIdeaLinks(question: ReferenceQuestion): QuestionIdeaLink[] {
  return question.ideaLinks.map((link) => ({ ideaId: link.ideaId, weight: link.weight, role: link.role }));
}
