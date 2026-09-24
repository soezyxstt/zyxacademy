import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import {
  aiQuestionBank,
  auditMutasi,
  assessmentSources,
  bab,
  courses,
  ide,
  knowledgeObjects,
  mataKuliah,
  pembahasanSoal,
  pengguna,
  soal,
  soalIde,
  questionReferenceLinks,
} from "@/db/schema";
import {
  canonicalQuestionStatus,
  deterministicQuestionSerialization,
  questionAuthoringInputSchema,
  type QuestionAuthoringInput,
  type QuestionAuthoringQuestion,
  type QuestionIdeaLink,
  type QuestionReferenceLink,
  type QuestionReviewStatus,
  questionReferenceLinkSchema,
} from "@/lib/question-authoring-contract";
import { validateExtractedQuestion, type ExtractedQuestion } from "@/lib/question-markdown";
import { referenceQuestionDraftSchema, type ReferenceQuestion, type ReferenceQuestionDraft, type ReferenceSourceMetadata, toQuestionIdeaLinks } from "@/lib/authoring/reference-question-draft";
import { offloadBase64ImagesToR2, offloadQuestionItemImages } from "@/lib/question-images";

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
  legacyChapterId: string | null;
};

export type PersistResult = {
  id: string;
  canonicalCourseId: string;
  legacyCourseId: string;
  chapterId: string | null;
  version: number;
  reviewStatus: QuestionReviewStatus;
  created: boolean;
  unchanged: boolean;
};

export type QuestionAuthoringBatchItem = {
  question: QuestionAuthoringQuestion;
  ideaLinks?: QuestionIdeaLink[];
  referenceLinks?: QuestionReferenceLink[];
  questionId?: string;
};

export type QuestionAuthoringBatchInput = {
  courseId: string;
  chapterId?: string | null;
  items: QuestionAuthoringBatchItem[];
  reviewStatus: QuestionReviewStatus;
  creatorId: string;
  createOnly?: boolean;
};

function fail(code: string, message: string): never {
  throw new QuestionAuthoringError(code, message);
}

export function isHistoricalReferenceLinkTarget(origin: string): origin is "historical_reference" {
  return origin === "historical_reference";
}

type SolutionQuestionLocator = Pick<ReferenceQuestion, "questionNumber" | "part">;

function normalizeSolutionLocator(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase().replace(/[()[\].:\-\s]/g, "");
  return normalized || null;
}

function parseSolutionQuestionMarker(line: string): { questionNumber: string; part: string | null } | null {
  const normalized = line.trim().replace(/^#{1,6}\s*/, "");
  const match = normalized.match(/^(?:(?:soal|question|nomor)\s+)?(\d+(?:\.\d+)?)(.*)$/i);
  if (!match) return null;

  const suffix = match[2] ?? "";
  const startsWithSeparator = /^[\s.)\]}:,]/.test(suffix)
    || suffix.startsWith("(")
    || suffix.startsWith("-")
    || suffix.startsWith("[");
  if (suffix && !startsWithSeparator && !/^[a-z][.)\]}:,]/i.test(suffix)) return null;
  const partMatch = suffix.match(/^[\s.)\]}:,]*\(?([a-z])[)\]}:,]/i);
  return {
    questionNumber: match[1],
    part: partMatch?.[1]?.toLowerCase() ?? null,
  };
}

function sameSolutionQuestion(left: SolutionQuestionLocator, right: { questionNumber: string; part: string | null }): boolean {
  const leftNumber = normalizeSolutionLocator(left.questionNumber);
  const rightNumber = normalizeSolutionLocator(right.questionNumber);
  if (!leftNumber || leftNumber !== rightNumber) return false;
  const leftPart = normalizeSolutionLocator(left.part);
  return leftPart === null || leftPart === normalizeSolutionLocator(right.part);
}

/**
 * Extracts one numbered solution block. Returning null when the source has no
 * reliable question marker is intentional, because storing the whole PDF text
 * would expose other questions' answers.
 */
export function extractHistoricalSolutionSpan(
  extractedText: string,
  question: SolutionQuestionLocator,
): string | null {
  const lines = extractedText.split(/\r?\n/);
  const markers = lines.flatMap((line, index) => {
    const marker = parseSolutionQuestionMarker(line);
    return marker ? [{ ...marker, index }] : [];
  });
  const start = markers.find((marker) => sameSolutionQuestion(question, marker));
  if (!start) return null;

  const end = markers.find((marker) => marker.index > start.index && (
    question.part !== null || normalizeSolutionLocator(marker.questionNumber) !== normalizeSolutionLocator(start.questionNumber)
  ));
  const content = lines.slice(start.index, end?.index).join("\n").trim();
  return content || null;
}

function hashQuestion(input: {
  courseId: string;
  chapterId: string | null;
  ideaLinks: QuestionAuthoringInput["ideaLinks"];
  question: QuestionAuthoringQuestion;
  version: number;
  referenceLinks?: QuestionReferenceLink[];
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

async function resolveContext(dbOrTx: Tx | typeof db, courseId: string, chapterId: string | null | undefined): Promise<AuthoringContext> {
  const [course] = await dbOrTx
    .select({ id: mataKuliah.id, legacyCourseId: mataKuliah.legacyCourseId, status: mataKuliah.status })
    .from(mataKuliah)
    .where(or(eq(mataKuliah.id, courseId), eq(mataKuliah.legacyCourseId, courseId)))
    .limit(1);
  if (!course || course.status !== "active") fail("QUESTION_AUTHORING_COURSE_NOT_FOUND", "Mata kuliah canonical tidak ditemukan atau belum aktif.");
  if (!course.legacyCourseId) fail("QUESTION_AUTHORING_LEGACY_COURSE_MAPPING_MISSING", "Mata kuliah belum memiliki pemetaan ke course lama.");

  const [legacyCourse] = await dbOrTx.select({ id: courses.id }).from(courses).where(eq(courses.id, course.legacyCourseId)).limit(1);
  if (!legacyCourse) fail("QUESTION_AUTHORING_LEGACY_COURSE_NOT_FOUND", "Course kompatibilitas tidak ditemukan.");

  let resolvedChapterId: string | null = null;
  let legacyChapterId: string | null = null;
  if (chapterId) {
    const [chapter] = await dbOrTx
      .select({ id: bab.id, legacyChapterId: bab.legacyChapterId, courseId: bab.mataKuliahId, status: bab.status })
      .from(bab)
      .where(or(eq(bab.id, chapterId), eq(bab.legacyChapterId, chapterId)))
      .limit(1);
    if (!chapter || chapter.status !== "active" || chapter.courseId !== course.id) {
      fail("QUESTION_AUTHORING_CHAPTER_NOT_FOUND", "Bab tidak ditemukan dalam mata kuliah yang dipilih.");
    }
    resolvedChapterId = chapter.id;
    legacyChapterId = chapter.legacyChapterId;
  }

  return { canonicalCourseId: course.id, legacyCourseId: legacyCourse.id, chapterId: resolvedChapterId, legacyChapterId };
}

async function validateIdeaLinks(tx: Tx, context: AuthoringContext, ideaLinks: QuestionAuthoringInput["ideaLinks"]): Promise<void> {
  if (ideaLinks.length === 0) return;
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
    if (idea.courseId !== context.canonicalCourseId) fail("QUESTION_AUTHORING_IDEA_COURSE_MISMATCH", "Idea harus berasal dari mata kuliah yang sama.");
    if (context.chapterId && idea.chapterId !== context.chapterId) fail("QUESTION_AUTHORING_IDEA_CHAPTER_MISMATCH", "Idea harus berasal dari bab yang dipilih.");
  }
}

async function validateReferenceLinks(
  tx: Tx,
  context: AuthoringContext,
  questionId: string | undefined,
  referenceLinks: QuestionReferenceLink[],
  ideaLinks: QuestionIdeaLink[],
): Promise<void> {
  if (referenceLinks.length === 0) return;
  const referenceIds = referenceLinks.map((link) => link.referenceQuestionId);
  if (new Set(referenceIds).size !== referenceIds.length) fail("QUESTION_REFERENCE_DUPLICATE", "Soal referensi yang sama tidak boleh diulang.");
  if (questionId && referenceIds.includes(questionId)) fail("QUESTION_REFERENCE_SELF_LINK", "Soal tidak dapat mereferensikan dirinya sendiri.");
  if (questionId) {
    const [currentQuestion] = await tx
      .select({ origin: soal.origin, courseId: soal.mataKuliahId })
      .from(soal)
      .where(eq(soal.id, questionId))
      .limit(1);
    if (currentQuestion && currentQuestion.origin !== "zyx_original") {
      fail("QUESTION_REFERENCE_SOURCE_INVALID", "Question yang memiliki reference link harus merupakan soal Zyx original.");
    }
    if (currentQuestion && currentQuestion.courseId !== context.canonicalCourseId) {
      fail("QUESTION_AUTHORING_COURSE_CHANGE_FORBIDDEN", "Soal tidak dapat dipindahkan ke mata kuliah lain saat diedit.");
    }
  }
  const rows = await tx
    .select({ id: soal.id, courseId: soal.mataKuliahId, origin: soal.origin, status: soal.status })
    .from(soal)
    .where(inArray(soal.id, referenceIds));
  if (rows.length !== referenceIds.length) fail("QUESTION_REFERENCE_NOT_FOUND", "Salah satu soal referensi tidak ditemukan.");
  for (const row of rows) {
    if (row.courseId !== context.canonicalCourseId) fail("QUESTION_REFERENCE_COURSE_MISMATCH", "Soal referensi harus berasal dari mata kuliah yang sama.");
    if (!isHistoricalReferenceLinkTarget(row.origin)) fail("QUESTION_REFERENCE_TARGET_INVALID", "Target reference link baru harus merupakan soal historical_reference.");
    if (row.status === "retired") fail("QUESTION_REFERENCE_RETIRED", "Soal referensi yang sudah retired tidak dapat digunakan.");
  }
  const referencedIdeaRows = await tx
    .select({ ideId: soalIde.ideId })
    .from(soalIde)
    .where(inArray(soalIde.soalId, referenceIds));
  const currentIdeaIds = new Set(ideaLinks.map((link) => link.ideaId));
  if (!referencedIdeaRows.some((row) => currentIdeaIds.has(row.ideId))) {
    fail("QUESTION_REFERENCE_IDEA_OVERLAP_REQUIRED", "Soal Zyx yang memakai referensi harus memiliki minimal satu Idea yang sama dengan soal referensi.");
  }
}

async function validateKnowledgeObject(tx: Tx, context: AuthoringContext, knowledgeObjectId: string | null | undefined): Promise<void> {
  if (knowledgeObjectId === undefined || knowledgeObjectId === null) return;
  const [knowledgeObject] = await tx
    .select({ courseId: knowledgeObjects.courseId, chapterId: knowledgeObjects.chapterId, status: knowledgeObjects.status })
    .from(knowledgeObjects)
    .where(eq(knowledgeObjects.id, knowledgeObjectId))
    .limit(1);
  if (!knowledgeObject) fail("QUESTION_AUTHORING_KO_NOT_FOUND", "Knowledge Object tidak ditemukan.");
  if (knowledgeObject.status !== "active") fail("QUESTION_AUTHORING_KO_NOT_ACTIVE", "Knowledge Object tidak aktif.");
  if (knowledgeObject.courseId !== context.legacyCourseId) fail("QUESTION_AUTHORING_KO_COURSE_MISMATCH", "Knowledge Object berasal dari mata kuliah lain.");
  if (context.chapterId && !context.legacyChapterId) fail("QUESTION_AUTHORING_CHAPTER_MAPPING_MISSING", "Bab belum memiliki pemetaan ke bab lama untuk Knowledge Object.");
  if (context.legacyChapterId && knowledgeObject.chapterId !== context.legacyChapterId) {
    fail("QUESTION_AUTHORING_KO_CHAPTER_MISMATCH", "Knowledge Object berasal dari bab lain.");
  }
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
  referenceLinks: QuestionReferenceLink[],
  creatorId: string,
  reviewStatus: QuestionReviewStatus,
  questionId?: string,
  createOnly = false,
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
      generationHash: soal.generationHash,
    })
    .from(soal)
    .where(eq(soal.id, canonicalId))
    .limit(1);
  if (existingCanonical && existingCanonical.origin !== "zyx_original") fail("HISTORICAL_QUESTION_IMMUTABLE", "Soal referensi historis tidak dapat diedit dari authoring manual.");
  if (existingCanonical && existingCanonical.courseId !== context.canonicalCourseId) fail("QUESTION_AUTHORING_COURSE_CHANGE_FORBIDDEN", "Soal tidak dapat dipindahkan ke mata kuliah lain saat diedit.");

  const [existingCompatibility] = await tx
    .select({
      id: aiQuestionBank.id,
      origin: aiQuestionBank.origin,
      courseId: aiQuestionBank.courseId,
      generationHash: aiQuestionBank.generationHash,
      reviewStatus: aiQuestionBank.reviewStatus,
      createdAt: aiQuestionBank.createdAt,
    })
    .from(aiQuestionBank)
    .where(eq(aiQuestionBank.id, canonicalId))
    .limit(1);
  if (existingCompatibility && existingCompatibility.origin !== "zyx_original") fail("HISTORICAL_QUESTION_IMMUTABLE", "Soal referensi historis tidak dapat diedit dari authoring manual.");
  if (existingCompatibility && existingCompatibility.courseId !== context.legacyCourseId) fail("QUESTION_AUTHORING_COURSE_CHANGE_FORBIDDEN", "Soal tidak dapat dipindahkan ke course lain saat diedit.");

  const canonicalStatus = canonicalQuestionStatus(reviewStatus);
  if (existingCanonical && existingCompatibility) {
    const existingInputHash = hashQuestion({
      courseId: context.canonicalCourseId,
      chapterId: context.chapterId,
      ideaLinks,
      question,
      version: existingCanonical.version,
      ...(referenceLinks.length > 0 ? { referenceLinks } : {}),
    });
    if (
      existingCanonical.generationHash === existingInputHash
      && existingCompatibility.generationHash === existingInputHash
      && existingCanonical.status === canonicalStatus
      && existingCompatibility.reviewStatus === reviewStatus
    ) {
      return {
        id: canonicalId,
        canonicalCourseId: context.canonicalCourseId,
        legacyCourseId: context.legacyCourseId,
        chapterId: context.chapterId,
        version: existingCanonical.version,
        reviewStatus,
        created: false,
        unchanged: true,
      };
    }
    if (createOnly) fail("QUESTION_AUTHORING_CONFLICT", `Soal ${canonicalId} sudah ada dengan isi yang berbeda.`);
  } else if (existingCanonical && createOnly) {
    fail("QUESTION_AUTHORING_CONFLICT", `Soal ${canonicalId} sudah ada tanpa projection kompatibilitas yang lengkap.`);
  }

  const version = existingCanonical ? existingCanonical.version + 1 : 1;
  const generationHash = hashQuestion({
    courseId: context.canonicalCourseId,
    chapterId: context.chapterId,
    ideaLinks,
    question,
    version,
    ...(referenceLinks.length > 0 ? { referenceLinks } : {}),
  });
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
        quizEligible: true,
        generationHash,
        curatorId: creatorId,
        publishedAt,
        updatedAt: now,
      })
      .where(eq(soal.id, canonicalId));
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
      quizEligible: true,
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
    quizEligible: true,
    ...(question.knowledgeObjectId !== undefined ? { knowledgeObjectId: question.knowledgeObjectId } : {}),
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
    pattern: question.reasoningPattern,
    reasoningType: question.reasoningPattern,
    ...(question.applicationLevel !== undefined ? { applicationLevel: question.applicationLevel } : {}),
    ...(question.estimatedSteps !== undefined ? { estimatedSteps: question.estimatedSteps } : {}),
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
    created: !existingCanonical,
    unchanged: false,
  };
}

async function prepareQuestion(input: QuestionAuthoringQuestion, index: number): Promise<QuestionAuthoringQuestion> {
  validateQuestion(input, index);
  return questionAuthoringInputSchema.omit({ courseId: true, chapterId: true, ideaLinks: true, reviewStatus: true }).parse(input);
}

export async function createCanonicalQuestion(input: QuestionAuthoringInput, creatorId: string): Promise<PersistResult> {
  const parsed = questionAuthoringInputSchema.parse(input);
  const context = await resolveContext(db, parsed.courseId, parsed.chapterId);
  const offloadedQuestion = await offloadQuestionItemImages(parsed, {
    courseSlug: context.canonicalCourseId,
    questionIdentifier: "canonical",
  });
  const question = await prepareQuestion(offloadedQuestion, 1);
  return db.transaction(async (tx) => {
    await requireCreator(tx, creatorId);
    await validateIdeaLinks(tx, context, parsed.ideaLinks);
    await validateKnowledgeObject(tx, context, question.knowledgeObjectId);
    return persistQuestionWithLinks(tx, context, question, parsed.ideaLinks, [], creatorId, parsed.reviewStatus);
  });
}

type PreparedBatch = {
  courseId: string;
  chapterId: string | null;
  reviewStatus: QuestionReviewStatus;
  items: Array<{ question: QuestionAuthoringQuestion; ideaLinks: QuestionIdeaLink[]; referenceLinks: QuestionReferenceLink[]; questionId?: string }>;
};

async function prepareBatch(input: Omit<QuestionAuthoringBatchInput, "creatorId"> | QuestionAuthoringBatchInput): Promise<PreparedBatch> {
  if (input.items.length === 0) fail("QUESTION_AUTHORING_EMPTY_BATCH", "Tidak ada soal untuk disimpan.");
  const base = questionAuthoringInputSchema.pick({ courseId: true, chapterId: true, reviewStatus: true }).parse(input);
  const items = await Promise.all(input.items.map(async (item, index) => ({
    question: await prepareQuestion(item.question, index + 1),
    ideaLinks: questionAuthoringInputSchema.shape.ideaLinks.parse(item.ideaLinks ?? []),
    referenceLinks: item.referenceLinks ? item.referenceLinks.map((link) => questionReferenceLinkSchema.parse(link)) : [],
    ...(item.questionId ? { questionId: item.questionId.trim() } : {}),
  })));
  if (items.some((item) => item.questionId === "")) fail("QUESTION_AUTHORING_ID_INVALID", "ID soal tidak boleh kosong.");
  const explicitIds = items.flatMap((item) => item.questionId ? [item.questionId] : []);
  if (new Set(explicitIds).size !== explicitIds.length) fail("QUESTION_AUTHORING_DUPLICATE_ID", "ID soal dalam satu batch harus unik.");
  return { courseId: base.courseId, chapterId: base.chapterId ?? null, reviewStatus: base.reviewStatus, items };
}

async function validatePreparedBatch(tx: Tx, prepared: PreparedBatch): Promise<AuthoringContext> {
  const context = await resolveContext(tx, prepared.courseId, prepared.chapterId);
  for (const item of prepared.items) {
    await validateIdeaLinks(tx, context, item.ideaLinks);
    await validateKnowledgeObject(tx, context, item.question.knowledgeObjectId);
    await validateReferenceLinks(tx, context, item.questionId, item.referenceLinks, item.ideaLinks);
  }
  return context;
}

export async function validateCanonicalQuestionBatch(input: Omit<QuestionAuthoringBatchInput, "creatorId">): Promise<{
  canonicalCourseId: string;
  legacyCourseId: string;
  chapterId: string | null;
  questionCount: number;
}> {
  const prepared = await prepareBatch(input);
  return db.transaction(async (tx) => {
    const context = await validatePreparedBatch(tx, prepared);
    return {
      canonicalCourseId: context.canonicalCourseId,
      legacyCourseId: context.legacyCourseId,
      chapterId: context.chapterId,
      questionCount: prepared.items.length,
    };
  });
}

export async function createCanonicalQuestionBatch(input: QuestionAuthoringBatchInput): Promise<PersistResult[]> {
  const prepared = await prepareBatch(input);
  const context = await resolveContext(db, prepared.courseId, prepared.chapterId);

  // Offload images outside the write transaction using resolved canonical course ID
  const offloadedItems = await Promise.all(
    prepared.items.map(async (item, index) => {
      const offloadedQuestion = await offloadQuestionItemImages(item.question, {
        courseSlug: context.canonicalCourseId,
        questionIdentifier: item.questionId || `q-${index + 1}`,
      });
      return { ...item, question: offloadedQuestion };
    })
  );

  return db.transaction(async (tx) => {
    await requireCreator(tx, input.creatorId);
    await validatePreparedBatch(tx, { ...prepared, items: offloadedItems });
    const results: PersistResult[] = [];
    for (const item of offloadedItems) {
      results.push(await persistQuestionWithLinks(
        tx,
        context,
        item.question,
        item.ideaLinks,
        item.referenceLinks,
        input.creatorId,
        prepared.reviewStatus,
        item.questionId,
        input.createOnly ?? false,
      ));
    }
    return results;
  });
}

async function persistQuestionWithLinks(
  tx: Tx,
  context: AuthoringContext,
  question: QuestionAuthoringQuestion,
  ideaLinks: QuestionAuthoringInput["ideaLinks"],
  referenceLinks: QuestionReferenceLink[],
  creatorId: string,
  reviewStatus: QuestionReviewStatus,
  questionId?: string,
  createOnly = false,
): Promise<PersistResult> {
  const result = await persistQuestion(tx, context, question, ideaLinks, referenceLinks, creatorId, reviewStatus, questionId, createOnly);
  if (result.unchanged) return result;
  await tx.delete(soalIde).where(eq(soalIde.soalId, result.id));
  await tx.delete(questionReferenceLinks).where(eq(questionReferenceLinks.questionId, result.id));
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
  for (const link of referenceLinks) {
    await tx.insert(questionReferenceLinks).values({
      id: `question-reference-${result.id}-${link.referenceQuestionId}-${link.role}`,
      questionId: result.id,
      referenceQuestionId: link.referenceQuestionId,
      role: link.role,
      createdAt: now,
    });
  }
  return result;
}

export async function updateCanonicalQuestion(input: QuestionAuthoringInput, creatorId: string, questionId: string): Promise<PersistResult> {
  const parsed = questionAuthoringInputSchema.parse(input);
  const context = await resolveContext(db, parsed.courseId, parsed.chapterId);
  const offloadedQuestion = await offloadQuestionItemImages(parsed, {
    courseSlug: context.canonicalCourseId,
    questionIdentifier: questionId,
  });
  const question = await prepareQuestion(offloadedQuestion, 1);
  return db.transaction(async (tx) => {
    await requireCreator(tx, creatorId);
    await validateIdeaLinks(tx, context, parsed.ideaLinks);
    await validateKnowledgeObject(tx, context, question.knowledgeObjectId);
    return persistQuestionWithLinks(tx, context, question, parsed.ideaLinks, [], creatorId, parsed.reviewStatus, questionId);
  });
}

export type HistoricalSourcePersistenceInput = {
  sourceDocumentId: string;
  solutionDocumentId: string | null;
  sourceFileKey: string;
  solutionFileKey: string | null;
  sourceMetadata: ReferenceSourceMetadata;
  solutionMetadata: ReferenceSourceMetadata | null;
};

export type HistoricalQuestionBatchInput = {
  courseId: string;
  creatorId: string;
  draft: ReferenceQuestionDraft;
  source: HistoricalSourcePersistenceInput;
};

function historicalCategory(assessmentType: ReferenceQuestionDraft["source"]["assessmentType"]): "tutorial" | "quiz" | "uts" | "uas" | "homework" | "exercise" | "other" {
  return assessmentType;
}

function historicalEventName(draft: ReferenceQuestionDraft, questionNumber: string): string {
  return [
    draft.source.title,
    draft.source.institution,
    draft.source.year ? String(draft.source.year) : null,
    `Soal ${questionNumber}`,
  ].filter(Boolean).join(" · ");
}

function historicalQuestionHash(courseId: string, sourceId: string, question: ReferenceQuestion): string {
  const { localId, ...stableQuestion } = question;
  void localId;
  return createHash("sha256")
    .update(deterministicQuestionSerialization({ courseId, sourceId, question: stableQuestion }), "utf8")
    .digest("hex");
}

function historicalQuestionOptions(question: ReferenceQuestion) {
  return question.options.map((text, index) => ({
    id: `option-${String(index + 1).padStart(2, "0")}`,
    text,
    isCorrect: question.correctIndices.includes(index),
  }));
}

type HistoricalIdeaLinkComparable = {
  ideaId: string;
  weight: number;
  role: string;
};

function normalizeHistoricalIdeaLinks(links: readonly HistoricalIdeaLinkComparable[]): HistoricalIdeaLinkComparable[] {
  return links
    .map((link) => ({ ideaId: link.ideaId, weight: link.weight, role: link.role }))
    .sort((left, right) => (
      left.ideaId.localeCompare(right.ideaId)
      || left.role.localeCompare(right.role)
      || left.weight - right.weight
    ));
}

export function getHistoricalSolutionContent(
  source: Pick<HistoricalSourcePersistenceInput, "solutionMetadata">,
  question: Pick<ReferenceQuestion, "solutionProvenance" | "questionNumber" | "part">,
): string | null {
  if (question.solutionProvenance !== "source_solution") return null;
  const content = source.solutionMetadata?.extractedText;
  if (!content) return null;
  return extractHistoricalSolutionSpan(content, question);
}

function historicalSourceHash(input: HistoricalSourcePersistenceInput): string {
  return createHash("sha256")
    .update(deterministicQuestionSerialization({
      sourceDocumentId: input.sourceDocumentId,
      sourceChecksum: input.sourceMetadata.checksum,
      solutionDocumentId: input.solutionDocumentId,
      solutionChecksum: input.solutionMetadata?.checksum ?? null,
    }), "utf8")
    .digest("hex");
}

/**
 * Ingests and directly publishes a batch of historical reference questions.
 *
 * @param input - Contains the draft questions, resolved source metadata, course, and creator.
 * @returns Array of persistence results with canonical IDs and publication status.
 */
export async function createHistoricalQuestionBatch(input: HistoricalQuestionBatchInput): Promise<PersistResult[]> {
  const draft = referenceQuestionDraftSchema.parse(input.draft);
  if (input.source.sourceMetadata.category !== "soal") fail("HISTORICAL_SOURCE_CATEGORY_INVALID", "Source utama harus berada pada kategori soal.");
  if (input.source.solutionMetadata && input.source.solutionMetadata.category !== "pembahasan_soal") fail("HISTORICAL_SOLUTION_CATEGORY_INVALID", "Source pembahasan harus berada pada kategori pembahasan_soal.");
  if (!input.source.sourceDocumentId) fail("HISTORICAL_SOURCE_DOCUMENT_REQUIRED", "Source document wajib tersedia.");
  if (input.source.sourceMetadata.fileKey !== input.source.sourceFileKey) fail("HISTORICAL_SOURCE_FILE_MISMATCH", "Source file key tidak cocok dengan metadata source yang di-resolve.");
  if (input.source.sourceMetadata.title !== draft.source.title) fail("HISTORICAL_SOURCE_TITLE_MISMATCH", "Judul source tidak cocok dengan metadata source yang di-resolve.");
  if (input.source.solutionFileKey && !input.source.solutionMetadata) fail("HISTORICAL_SOLUTION_FILE_NOT_FOUND", "Metadata source pembahasan wajib tersedia saat solutionFileKey dipakai.");
  if (!input.source.solutionFileKey && input.source.solutionMetadata) fail("HISTORICAL_SOLUTION_METADATA_UNEXPECTED", "Metadata source pembahasan tidak boleh ada tanpa solutionFileKey.");
  if (input.source.solutionMetadata && input.source.solutionMetadata.fileKey !== input.source.solutionFileKey) fail("HISTORICAL_SOLUTION_FILE_MISMATCH", "Solution file key tidak cocok dengan metadata source pembahasan yang di-resolve.");
  if (input.source.sourceMetadata.pageCount !== undefined && input.source.sourceMetadata.pageCount !== null && (!Number.isInteger(input.source.sourceMetadata.pageCount) || input.source.sourceMetadata.pageCount < 1)) {
    fail("HISTORICAL_SOURCE_PAGE_COUNT_INVALID", "Jumlah halaman source harus berupa bilangan bulat positif.");
  }
  if (input.source.solutionMetadata?.pageCount !== undefined && input.source.solutionMetadata.pageCount !== null && (!Number.isInteger(input.source.solutionMetadata.pageCount) || input.source.solutionMetadata.pageCount < 1)) {
    fail("HISTORICAL_SOLUTION_PAGE_COUNT_INVALID", "Jumlah halaman source pembahasan harus berupa bilangan bulat positif.");
  }
  if (input.source.sourceMetadata.pageCount !== undefined && input.source.sourceMetadata.pageCount !== null) {
    const pageCount = input.source.sourceMetadata.pageCount;
    if (draft.questions.some((question) => question.page > pageCount)) fail("HISTORICAL_PAGE_OUT_OF_RANGE", "Salah satu nomor halaman soal melebihi jumlah halaman source.");
  }

  const context = await resolveContext(db, input.courseId, null);
  const processedQuestions = await Promise.all(
    draft.questions.map(async (question) => {
      const offloadedQuestion = await offloadQuestionItemImages(question, {
        courseSlug: context.canonicalCourseId,
        questionIdentifier: question.questionNumber,
      });
      const rawExplanation = getHistoricalSolutionContent(input.source, question);
      const explanation = rawExplanation
        ? await offloadBase64ImagesToR2(rawExplanation, {
            courseSlug: context.canonicalCourseId,
            questionIdentifier: `${question.questionNumber}-solution`,
          })
        : null;
      return { question: offloadedQuestion, explanation };
    })
  );

  return db.transaction(async (tx) => {
    await requireCreator(tx, input.creatorId);

    const sourceHash = historicalSourceHash(input.source);
    let [assessmentSource] = await tx
      .select()
      .from(assessmentSources)
      .where(and(
        eq(assessmentSources.canonicalCourseId, context.canonicalCourseId),
        eq(assessmentSources.sourceDocumentId, input.source.sourceDocumentId),
      ))
      .limit(1);
    if (assessmentSource && (
      assessmentSource.sourceHash !== sourceHash
      || assessmentSource.title !== draft.source.title
      || assessmentSource.category !== historicalCategory(draft.source.assessmentType)
      || assessmentSource.assessmentType !== draft.source.assessmentType
      || assessmentSource.year !== draft.source.year
      || assessmentSource.institution !== draft.source.institution
      || assessmentSource.academicYearLabel !== draft.source.academicYearLabel
      || assessmentSource.term !== draft.source.term
      || assessmentSource.solutionDocumentId !== input.source.solutionDocumentId
    )) {
      fail("HISTORICAL_SOURCE_CONFLICT", "Source document yang sama sudah terdaftar dengan metadata atau checksum berbeda.");
    }
    const now = new Date();
    if (!assessmentSource) {
      const sourceId = `assessment-ref-${createHash("sha256").update(deterministicQuestionSerialization({ courseId: context.canonicalCourseId, sourceDocumentId: input.source.sourceDocumentId }), "utf8").digest("hex").slice(0, 32)}`;
      await tx.insert(assessmentSources).values({
        id: sourceId,
        courseId: context.legacyCourseId,
        canonicalCourseId: context.canonicalCourseId,
        title: draft.source.title,
        origin: "uploaded",
        category: historicalCategory(draft.source.assessmentType),
        assessmentType: draft.source.assessmentType,
        year: draft.source.year,
        institution: draft.source.institution,
        academicYearLabel: draft.source.academicYearLabel,
        term: draft.source.term,
        sourceDocumentId: input.source.sourceDocumentId,
        solutionDocumentId: input.source.solutionDocumentId,
        status: "draft",
        sourceMarkdown: "",
        sourceHash,
        version: 1,
        parserVersion: "historical-reference.v1",
        ingestionStatus: "completed",
        ingestionCompletedAt: now,
        originalFilename: null,
        uploadthingKey: null,
        uploadedByUserId: input.creatorId,
        createdAt: now,
        updatedAt: now,
      });
      [assessmentSource] = await tx.select().from(assessmentSources).where(eq(assessmentSources.id, sourceId)).limit(1);
    }
    if (!assessmentSource) fail("HISTORICAL_SOURCE_PERSIST_FAILED", "Assessment source historis gagal disimpan.");

    const results: PersistResult[] = [];
    for (const { question, explanation } of processedQuestions) {
      const sourceEventName = historicalEventName(draft, question.questionNumber);
      const questionIdentity = `${assessmentSource.id}:${question.questionNumber}:${question.part ?? ""}`;
      const canonicalId = `soal-ref-${createHash("sha256").update(questionIdentity, "utf8").digest("hex").slice(0, 32)}`;
      const generationHash = historicalQuestionHash(context.canonicalCourseId, assessmentSource.id, question);
      const existingFields = {
        id: soal.id,
        version: soal.version,
        origin: soal.origin,
        generationHash: soal.generationHash,
        courseId: soal.mataKuliahId,
        status: soal.status,
        creatorId: soal.creatorId,
        assessmentSourceId: soal.assessmentSourceId,
        sourceQuestionNumber: soal.sourceQuestionNumber,
        sourceQuestionPart: soal.sourceQuestionPart,
        questionType: soal.questionType,
        prompt: soal.prompt,
        optionsSnapshot: soal.optionsSnapshot,
        sourcePage: soal.sourcePage,
        answerProvenance: soal.answerProvenance,
        solutionProvenance: soal.solutionProvenance,
        quizEligible: soal.quizEligible,
        difficulty: soal.difficulty,
        cognitiveLevel: soal.cognitiveLevel,
      };
      const [existingById] = await tx.select(existingFields).from(soal).where(eq(soal.id, canonicalId)).limit(1);
      const [existingByLocator] = existingById
        ? [undefined]
        : await tx.select(existingFields).from(soal).where(and(
          eq(soal.assessmentSourceId, assessmentSource.id),
          eq(soal.sourceQuestionNumber, question.questionNumber),
          question.part === null ? isNull(soal.sourceQuestionPart) : eq(soal.sourceQuestionPart, question.part),
        )).limit(1);
      const existing = existingById ?? existingByLocator;
      if (existing && (
        existing.origin !== "historical_reference"
        || existing.courseId !== context.canonicalCourseId
        || existing.assessmentSourceId !== assessmentSource.id
      )) fail("HISTORICAL_QUESTION_CONFLICT", `Soal ${question.questionNumber} sudah digunakan oleh record lain.`);
      if (existing && existing.generationHash !== generationHash) {
        const [existingProjection] = await tx.select({
          correctIndices: aiQuestionBank.correctIndices,
          acceptableAnswers: aiQuestionBank.acceptableAnswers,
        }).from(aiQuestionBank).where(eq(aiQuestionBank.id, existing.id)).limit(1);
        const existingIdeaLinks = await tx.select({
          ideaId: soalIde.ideId,
          weight: soalIde.weight,
          role: soalIde.role,
        }).from(soalIde).where(eq(soalIde.soalId, existing.id));
        const sameQuestion = existing.questionType === question.questionType
          && existing.prompt === question.prompt
          && JSON.stringify(existing.optionsSnapshot) === JSON.stringify(historicalQuestionOptions(question))
          && existing.sourcePage === question.page
          && existing.answerProvenance === question.answerProvenance
          && existing.solutionProvenance === question.solutionProvenance
          && existing.quizEligible === question.quizEligible
          && existing.difficulty === question.difficulty
          && existing.cognitiveLevel === question.cognitiveLevel
          && JSON.stringify(existingProjection?.correctIndices ?? []) === JSON.stringify(question.correctIndices)
          && JSON.stringify(existingProjection?.acceptableAnswers ?? []) === JSON.stringify(question.acceptableAnswers)
          && JSON.stringify(normalizeHistoricalIdeaLinks(existingIdeaLinks)) === JSON.stringify(normalizeHistoricalIdeaLinks(question.ideaLinks));
        if (!sameQuestion) fail("HISTORICAL_QUESTION_CONFLICT", `Soal ${question.questionNumber} sudah ada dengan isi berbeda.`);
      }
      if (existing) {
        results.push({ id: existing.id, canonicalCourseId: context.canonicalCourseId, legacyCourseId: context.legacyCourseId, chapterId: null, version: existing.version, reviewStatus: existing.status === "published" ? "published" : existing.status === "retired" ? "retired" : "generated", created: false, unchanged: true });
        continue;
      }

      const optionsSnapshot = historicalQuestionOptions(question);
      await tx.insert(soal).values({
        id: canonicalId,
        mataKuliahId: context.canonicalCourseId,
        babId: null,
        questionType: question.questionType,
        prompt: question.prompt,
        optionsSnapshot,
        origin: "historical_reference",
        sourceEventName,
        sourceReferenceId: assessmentSource.id,
        assessmentSourceId: assessmentSource.id,
        sourceQuestionNumber: question.questionNumber,
        sourceQuestionPart: question.part,
        sourcePage: question.page,
        sourceLocator: {
          sourceFileKey: input.source.sourceFileKey,
          sourceChecksum: input.source.sourceMetadata.checksum,
          sourcePageCount: input.source.sourceMetadata.pageCount ?? null,
          solutionFileKey: input.source.solutionFileKey,
          solutionChecksum: input.source.solutionMetadata?.checksum ?? null,
          solutionPageCount: input.source.solutionMetadata?.pageCount ?? null,
          page: question.page,
        },
        answerProvenance: question.answerProvenance,
        solutionProvenance: question.solutionProvenance,
        quizEligible: question.quizEligible,
        version: 1,
        status: "published",
        difficulty: question.difficulty,
        cognitiveLevel: question.cognitiveLevel,
        reasoningPattern: "historical_reference",
        generationHash,
        creatorId: input.creatorId,
        curatorId: null,
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      if (explanation) {
        await tx.insert(pembahasanSoal).values({
          id: `${canonicalId}:historical-solution:v1`,
          soalId: canonicalId,
          version: 1,
          content: explanation,
          status: "published",
          generationHash,
          creatorId: input.creatorId,
          curatorId: null,
          publishedAt: now,
          createdAt: now,
          updatedAt: now,
        });
      }
      await validateIdeaLinks(tx, context, toQuestionIdeaLinks(question));
      for (const link of question.ideaLinks) {
        await tx.insert(soalIde).values({
          id: `soal-ide-${canonicalId}-${link.ideaId}`,
          soalId: canonicalId,
          ideId: link.ideaId,
          weight: link.weight,
          role: link.role,
          createdAt: now,
        });
      }
      await tx.insert(aiQuestionBank).values({
        id: canonicalId,
        courseId: context.legacyCourseId,
        origin: "historical_reference",
        sourceEventName,
        sourceReferenceId: assessmentSource.id,
        assessmentSourceId: assessmentSource.id,
        sourceQuestionNumber: question.questionNumber,
        sourceQuestionPart: question.part,
        sourcePage: question.page,
        answerProvenance: question.answerProvenance,
        solutionProvenance: question.solutionProvenance,
        quizEligible: question.quizEligible,
        generationHash,
        status: "active",
        isStale: false,
        difficulty: question.difficulty,
        questionType: question.questionType,
        tags: ["historical_reference", draft.source.assessmentType],
        prompt: question.prompt,
        options: question.options,
        correctIndices: question.correctIndices,
        acceptableAnswers: question.acceptableAnswers,
        distractorMap: [],
        explanation: explanation ?? "",
        reviewStatus: "published",
        pattern: "historical_reference",
        reasoningType: "historical_reference",
        createdAt: now,
      });
      await tx.insert(auditMutasi).values({
        id: `audit-question-${canonicalId}-1-${randomUUID()}`,
        actorId: input.creatorId,
        entityType: "question",
        entityId: canonicalId,
        action: "published",
        beforeSnapshot: null,
        afterSnapshot: { origin: "historical_reference", assessmentSourceId: assessmentSource.id, questionNumber: question.questionNumber, answerProvenance: question.answerProvenance, solutionProvenance: question.solutionProvenance, quizEligible: question.quizEligible },
        correlationId: assessmentSource.id,
        createdAt: now,
      });
      results.push({ id: canonicalId, canonicalCourseId: context.canonicalCourseId, legacyCourseId: context.legacyCourseId, chapterId: null, version: 1, reviewStatus: "published", created: true, unchanged: false });
    }
    return results;
  });
}
