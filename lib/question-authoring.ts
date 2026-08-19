import { createHash, randomUUID } from "node:crypto";
import { eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import {
  aiQuestionBank,
  auditMutasi,
  bab,
  courses,
  ide,
  mataKuliah,
  pembahasanSoal,
  pengguna,
  soal,
  soalIde,
} from "@/db/schema";
import {
  canonicalQuestionStatus,
  deterministicQuestionSerialization,
  questionAuthoringInputSchema,
  type QuestionAuthoringInput,
  type QuestionAuthoringQuestion,
  type QuestionReviewStatus,
} from "@/lib/question-authoring-contract";
import { validateExtractedQuestion, type ExtractedQuestion } from "@/lib/question-markdown";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class QuestionAuthoringError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "QuestionAuthoringError";
    this.code = code;
  }
}

type AuthoringContext = {
  canonicalCourseId: string;
  legacyCourseId: string;
  chapterId: string | null;
};

type PersistResult = {
  id: string;
  canonicalCourseId: string;
  legacyCourseId: string;
  chapterId: string | null;
  version: number;
  reviewStatus: QuestionReviewStatus;
};

function fail(code: string, message: string): never {
  throw new QuestionAuthoringError(code, message);
}

function hashQuestion(input: {
  courseId: string;
  chapterId: string | null;
  ideaLinks: QuestionAuthoringInput["ideaLinks"];
  question: QuestionAuthoringQuestion;
  version: number;
}): string {
  return createHash("sha256")
    .update(deterministicQuestionSerialization(input), "utf8")
    .digest("hex");
}

function validateQuestion(question: QuestionAuthoringQuestion, index: number): void {
  const extracted: ExtractedQuestion = { ...question, sourceIndex: index };
  const error = validateExtractedQuestion(extracted, index);
  if (error) fail("QUESTION_AUTHORING_INVALID_QUESTION", error);

  if (new Set(question.correctIndices).size !== question.correctIndices.length) {
    fail("QUESTION_AUTHORING_DUPLICATE_ANSWER", `Soal nomor ${index} memiliki kunci jawaban ganda yang sama.`);
  }
}

async function requireCreator(tx: Tx, creatorId: string): Promise<void> {
  const [identity] = await tx
    .select({ id: pengguna.id, status: pengguna.status })
    .from(pengguna)
    .where(eq(pengguna.id, creatorId))
    .limit(1);
  if (!identity || identity.status !== "active") fail("QUESTION_AUTHORING_CREATOR_NOT_FOUND", "Identitas pembuat soal tidak aktif.");
}

async function resolveContext(tx: Tx, courseId: string, chapterId: string | null | undefined, ideaLinks: QuestionAuthoringInput["ideaLinks"]): Promise<AuthoringContext> {
  const [course] = await tx
    .select({ id: mataKuliah.id, legacyCourseId: mataKuliah.legacyCourseId, status: mataKuliah.status })
    .from(mataKuliah)
    .where(or(eq(mataKuliah.id, courseId), eq(mataKuliah.legacyCourseId, courseId)))
    .limit(1);
  if (!course || course.status !== "active") fail("QUESTION_AUTHORING_COURSE_NOT_FOUND", "Mata kuliah canonical tidak ditemukan atau belum aktif.");
  if (!course.legacyCourseId) fail("QUESTION_AUTHORING_LEGACY_COURSE_MAPPING_MISSING", "Mata kuliah belum memiliki pemetaan ke course lama.");

  const [legacyCourse] = await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, course.legacyCourseId)).limit(1);
  if (!legacyCourse) fail("QUESTION_AUTHORING_LEGACY_COURSE_NOT_FOUND", "Course kompatibilitas tidak ditemukan.");

  let resolvedChapterId: string | null = null;
  if (chapterId) {
    const [chapter] = await tx
      .select({ id: bab.id, courseId: bab.mataKuliahId, status: bab.status })
      .from(bab)
      .where(or(eq(bab.id, chapterId), eq(bab.legacyChapterId, chapterId)))
      .limit(1);
    if (!chapter || chapter.status !== "active" || chapter.courseId !== course.id) {
      fail("QUESTION_AUTHORING_CHAPTER_NOT_FOUND", "Bab tidak ditemukan dalam mata kuliah yang dipilih.");
    }
    resolvedChapterId = chapter.id;
  }

  const uniqueIdeaIds = [...new Set(ideaLinks.map((link) => link.ideaId))];
  if (uniqueIdeaIds.length !== ideaLinks.length) fail("QUESTION_AUTHORING_DUPLICATE_IDEA", "Idea yang sama tidak boleh dipilih lebih dari sekali.");
  const weightSum = ideaLinks.reduce((sum, link) => sum + link.weight, 0);
  if (Math.abs(weightSum - 1) > 0.000001) fail("QUESTION_AUTHORING_IDEA_WEIGHT_INVALID", "Total bobot Idea harus sama dengan 1.");

  const ideaRows = await tx
    .select({ id: ide.id, courseId: ide.mataKuliahId, chapterId: ide.babId, status: ide.status })
    .from(ide)
    .where(inArray(ide.id, uniqueIdeaIds));
  if (ideaRows.length !== uniqueIdeaIds.length) fail("QUESTION_AUTHORING_IDEA_NOT_FOUND", "Salah satu Idea yang dipilih tidak ditemukan.");

  for (const idea of ideaRows) {
    if (idea.status !== "published") fail("QUESTION_AUTHORING_IDEA_NOT_PUBLISHED", "Semua Idea harus berstatus published.");
    if (idea.courseId !== course.id) fail("QUESTION_AUTHORING_IDEA_COURSE_MISMATCH", "Idea harus berasal dari mata kuliah yang sama.");
    if (resolvedChapterId && idea.chapterId !== resolvedChapterId) fail("QUESTION_AUTHORING_IDEA_CHAPTER_MISMATCH", "Idea harus berasal dari bab yang dipilih.");
  }

  return { canonicalCourseId: course.id, legacyCourseId: legacyCourse.id, chapterId: resolvedChapterId };
}

function optionSnapshot(question: QuestionAuthoringQuestion): Array<{ id: string; text: string; isCorrect: boolean }> {
  return question.options.map((text, index) => ({
    id: `option-${String(index + 1).padStart(2, "0")}`,
    text: text.trim(),
    isCorrect: question.correctIndices.includes(index),
  }));
}

async function persistQuestion(
  tx: Tx,
  context: AuthoringContext,
  question: QuestionAuthoringQuestion,
  ideaLinks: QuestionAuthoringInput["ideaLinks"],
  creatorId: string,
  reviewStatus: QuestionReviewStatus,
  questionId?: string,
): Promise<PersistResult> {
  const canonicalId = questionId ?? `soal-manual-${randomUUID()}`;
  const [existingCanonical] = await tx
    .select({
      id: soal.id,
      version: soal.version,
      origin: soal.origin,
      courseId: soal.mataKuliahId,
      creatorId: soal.creatorId,
      status: soal.status,
    })
    .from(soal)
    .where(eq(soal.id, canonicalId))
    .limit(1);
  if (existingCanonical?.origin === "itb_example") fail("QUESTION_AUTHORING_ITB_IMMUTABLE", "Soal contoh ITB tidak dapat diedit dari authoring manual.");
  if (existingCanonical && existingCanonical.courseId !== context.canonicalCourseId) fail("QUESTION_AUTHORING_COURSE_CHANGE_FORBIDDEN", "Soal tidak dapat dipindahkan ke mata kuliah lain saat diedit.");

  const [existingCompatibility] = await tx
    .select({ id: aiQuestionBank.id, origin: aiQuestionBank.origin, courseId: aiQuestionBank.courseId, createdAt: aiQuestionBank.createdAt })
    .from(aiQuestionBank)
    .where(eq(aiQuestionBank.id, canonicalId))
    .limit(1);
  if (existingCompatibility?.origin === "itb_example") fail("QUESTION_AUTHORING_ITB_IMMUTABLE", "Soal contoh ITB tidak dapat diedit dari authoring manual.");
  if (existingCompatibility && existingCompatibility.courseId !== context.legacyCourseId) fail("QUESTION_AUTHORING_COURSE_CHANGE_FORBIDDEN", "Soal tidak dapat dipindahkan ke course lain saat diedit.");

  const version = existingCanonical ? existingCanonical.version + 1 : 1;
  const generationHash = hashQuestion({
    courseId: context.canonicalCourseId,
    chapterId: context.chapterId,
    ideaLinks,
    question,
    version,
  });
  const canonicalStatus = canonicalQuestionStatus(reviewStatus);
  const now = new Date();
  const publishedAt = canonicalStatus === "published" ? now : null;
  const options = optionSnapshot(question);

  if (existingCanonical) {
    await tx
      .update(soal)
      .set({
        mataKuliahId: context.canonicalCourseId,
        babId: context.chapterId,
        questionType: question.questionType,
        prompt: question.prompt,
        optionsSnapshot: options,
        difficulty: question.difficulty,
        cognitiveLevel: question.cognitiveLevel,
        reasoningPattern: question.reasoningPattern,
        version,
        status: canonicalStatus,
        generationHash,
        curatorId: creatorId,
        publishedAt,
        updatedAt: now,
      })
      .where(eq(soal.id, canonicalId));
    await tx.delete(soalIde).where(eq(soalIde.soalId, canonicalId));
  } else {
    await tx.insert(soal).values({
      id: canonicalId,
      mataKuliahId: context.canonicalCourseId,
      babId: context.chapterId,
      questionType: question.questionType,
      prompt: question.prompt,
      optionsSnapshot: options,
      origin: "zyx_original",
      sourceEventName: null,
      sourceReferenceId: null,
      version,
      status: canonicalStatus,
      difficulty: question.difficulty,
      cognitiveLevel: question.cognitiveLevel,
      reasoningPattern: question.reasoningPattern,
      generationHash,
      creatorId,
      curatorId: null,
      publishedAt,
      createdAt: now,
      updatedAt: now,
    });
  }

  const solutionId = `${canonicalId}:manual-solution:v${version}`;
  await tx.insert(pembahasanSoal).values({
    id: solutionId,
    soalId: canonicalId,
    version,
    content: question.explanation,
    status: canonicalStatus,
    generationHash,
    creatorId: existingCanonical?.creatorId ?? creatorId,
    curatorId: existingCanonical ? creatorId : null,
    publishedAt,
    createdAt: now,
    updatedAt: now,
  });

  const compatibilityValues = {
    id: canonicalId,
    courseId: context.legacyCourseId,
    origin: "zyx_original" as const,
    sourceEventName: null,
    sourceReferenceId: null,
    generationHash,
    status: canonicalStatus === "retired" ? "retired" : "active",
    isStale: false,
    difficulty: question.difficulty,
    questionType: question.questionType,
    tags: [...new Set(["canonical", ...question.tags])],
    prompt: question.prompt,
    options: question.options.map((option) => option.trim()),
    correctIndices: question.correctIndices,
    acceptableAnswers: question.acceptableAnswers,
    distractorMap: [],
    explanation: question.explanation,
    reviewStatus,
    reasoningType: question.reasoningPattern,
    createdAt: existingCompatibility?.createdAt ?? now,
  };
  if (existingCompatibility) {
    await tx.update(aiQuestionBank).set(compatibilityValues).where(eq(aiQuestionBank.id, canonicalId));
  } else {
    await tx.insert(aiQuestionBank).values(compatibilityValues);
  }

  await tx.insert(auditMutasi).values({
    id: `audit-question-${canonicalId}-${version}-${randomUUID()}`,
    actorId: creatorId,
    entityType: "question",
    entityId: canonicalId,
    action: existingCanonical ? (canonicalStatus === "published" ? "published" : "updated") : (canonicalStatus === "published" ? "created_published" : "created_draft"),
    beforeSnapshot: existingCanonical ? { version: existingCanonical.version, status: existingCanonical.status, courseId: existingCanonical.courseId } : null,
    afterSnapshot: {
      version,
      status: canonicalStatus,
      reviewStatus,
      courseId: context.canonicalCourseId,
      chapterId: context.chapterId,
      ideaIds: ideaLinks.map((link) => link.ideaId),
      generationHash,
    },
    correlationId: canonicalId,
    createdAt: now,
  });

  return {
    id: canonicalId,
    canonicalCourseId: context.canonicalCourseId,
    legacyCourseId: context.legacyCourseId,
    chapterId: context.chapterId,
    version,
    reviewStatus,
  };
}

async function prepareQuestion(input: QuestionAuthoringQuestion, index: number): Promise<QuestionAuthoringQuestion> {
  validateQuestion(input, index);
  return questionAuthoringInputSchema.omit({ courseId: true, chapterId: true, ideaLinks: true, reviewStatus: true }).parse(input);
}

export async function createCanonicalQuestion(input: QuestionAuthoringInput, creatorId: string): Promise<PersistResult> {
  const parsed = questionAuthoringInputSchema.parse(input);
  const question = await prepareQuestion(parsed, 1);
  return db.transaction(async (tx) => {
    await requireCreator(tx, creatorId);
    const context = await resolveContext(tx, parsed.courseId, parsed.chapterId, parsed.ideaLinks);
    return persistQuestionWithLinks(tx, context, question, parsed.ideaLinks, creatorId, parsed.reviewStatus);
  });
}

export async function createCanonicalQuestionBatch(input: {
  courseId: string;
  chapterId?: string | null;
  ideaLinks: QuestionAuthoringInput["ideaLinks"];
  questions: QuestionAuthoringQuestion[];
  reviewStatus: QuestionReviewStatus;
  creatorId: string;
}): Promise<PersistResult[]> {
  if (input.questions.length === 0) fail("QUESTION_AUTHORING_EMPTY_BATCH", "Tidak ada soal untuk disimpan.");
  const base = questionAuthoringInputSchema.pick({ courseId: true, chapterId: true, ideaLinks: true, reviewStatus: true }).parse(input);
  const questions = await Promise.all(input.questions.map((question, index) => prepareQuestion(question, index + 1)));
  return db.transaction(async (tx) => {
    await requireCreator(tx, input.creatorId);
    const context = await resolveContext(tx, base.courseId, base.chapterId, base.ideaLinks);
    const results: PersistResult[] = [];
    for (const question of questions) {
      results.push(await persistQuestionWithLinks(tx, context, question, base.ideaLinks, input.creatorId, base.reviewStatus));
    }
    return results;
  });
}

async function persistQuestionWithLinks(
  tx: Tx,
  context: AuthoringContext,
  question: QuestionAuthoringQuestion,
  ideaLinks: QuestionAuthoringInput["ideaLinks"],
  creatorId: string,
  reviewStatus: QuestionReviewStatus,
  questionId?: string,
): Promise<PersistResult> {
  const result = await persistQuestion(tx, context, question, ideaLinks, creatorId, reviewStatus, questionId);
  await tx.delete(soalIde).where(eq(soalIde.soalId, result.id));
  const now = new Date();
  for (const link of ideaLinks) {
    await tx.insert(soalIde).values({
      id: `soal-ide-${result.id}-${link.ideaId}`,
      soalId: result.id,
      ideId: link.ideaId,
      weight: link.weight,
      role: link.role,
      createdAt: now,
    });
  }
  return result;
}

export async function updateCanonicalQuestion(input: QuestionAuthoringInput, creatorId: string, questionId: string): Promise<PersistResult> {
  const parsed = questionAuthoringInputSchema.parse(input);
  const question = await prepareQuestion(parsed, 1);
  return db.transaction(async (tx) => {
    await requireCreator(tx, creatorId);
    const context = await resolveContext(tx, parsed.courseId, parsed.chapterId, parsed.ideaLinks);
    return persistQuestionWithLinks(tx, context, question, parsed.ideaLinks, creatorId, parsed.reviewStatus, questionId);
  });
}
