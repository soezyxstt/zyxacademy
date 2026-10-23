"use server";

import { resolveCodingTutorContext, CODING_TUTOR_INSTRUCTIONS } from "@/lib/coding/tutor-context-server";
import { getConversationMemory } from "@/lib/zyra/conversation-memory";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { TutorActionService } from "@/lib/tutor-actions";
import { db } from "@/db";
import { aiQuestionBank, knowledgeObjects, tutorChatMessages, chatSessions, studentQuizAttempts, quizTemplates, zyraMessageAttachments, bab, chapters, mataKuliah, courseMaterials, diktatMateri } from "@/db/schema";
import { eq, and, asc, desc, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { exams } from "@/lib/student-course-fixtures";
import { askTutorRag, type TutorPageContext } from "@/lib/tutor-rag";
import { getOrCreateChatSession } from "@/lib/zyra/zyra-context-builder";
import { isFreeChapterScoped } from "@/lib/course-utils";
import { resolveCourseAccess, type CourseAccessResult } from "@/lib/student/course-access";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import { getCanonicalPublishedArticle, getCanonicalPublishedTextProduct } from "@/lib/articles/structured-repository";
import { FREE_ALLOWANCE_IDEMPOTENCY_PREFIX } from "@/lib/usage-budget-service";
import { zyraRuntimeEnv } from "@/lib/zyra/runtime-env";
import {
  assertZyraImageCount,
  isZyraImageFeatureEnabled,
  loadZyraImageParts,
  markZyraAttachmentsDispatched,
} from "@/lib/zyra/images";
import type { ZyraImageMime } from "@/lib/zyra/images";
import {
  deserializeTutorMessageSources,
  isZyraCanvasFeatureEnabled,
  serializeTutorMessageSources,
} from "@/lib/zyra/canvas";
import { sanitizeAnswer } from "@/lib/tutor/answer-sanitizer";

/** Thrown when a signed-in user has no access to the requested course. */
const NOT_ENROLLED = "NOT_ENROLLED";
const UPGRADE_REQUIRED = "UPGRADE_REQUIRED";
const COURSE_SCOPE_REQUIRED = "COURSE_SCOPE_REQUIRED";
const FREE_TEXT_ONLY = "FREE_TEXT_ONLY";
const CHAT_SESSION_ACCESS_DENIED = "CHAT_SESSION_ACCESS_DENIED";
const MISTAKE_ATTEMPT_REQUIRED = "MISTAKE_ATTEMPT_REQUIRED";

type TutorCourseAuthorization = {
  user: Awaited<ReturnType<typeof requireUser>>;
  access: CourseAccessResult;
};

async function requireUser() {
  const h = await headers();
  const session = await auth.api.getSession({
    headers: h,
  });
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  return session.user;
}

/** Every course-scoped server action resolves the central access policy. */
async function requireCourseAccess(courseId: string | null | undefined): Promise<TutorCourseAuthorization> {
  const user = await requireUser();
  const normalizedCourseId = typeof courseId === "string" ? courseId.trim() : "";
  if (!normalizedCourseId || normalizedCourseId === "unknown") {
    throw new Error(COURSE_SCOPE_REQUIRED);
  }
  const access = await resolveCourseAccess({ courseId: normalizedCourseId, userId: user.id });
  // All actors, including admins, must pass the central active-course and
  // role/assignment policy. A session role is never an authorization bypass.
  if (!access.hasCourseAccess) {
    if (access.reason === "COURSE_NOT_FOUND"
      || access.reason === "COURSE_INACTIVE"
      || access.reason === "COURSE_MAPPING_AMBIGUOUS") {
      throw new Error(COURSE_SCOPE_REQUIRED);
    }
    throw new Error(NOT_ENROLLED);
  }
  return { user, access };
}

/**
 * A client-provided chat session is an authorization boundary, not merely a
 * grouping key. Resolve it against both the authenticated owner and course
 * before reading, writing, attaching, or deleting any conversation data.
 */
async function requireOwnedChatSession(
  userId: string,
  courseId: string,
  requestedSessionId: string | null | undefined,
  title: string,
): Promise<string> {
  const sessionId = typeof requestedSessionId === "string" ? requestedSessionId.trim() : "";
  if (sessionId) {
    const [session] = await db
      .select({ id: chatSessions.id })
      .from(chatSessions)
      .where(and(
        eq(chatSessions.id, sessionId),
        eq(chatSessions.studentId, userId),
        eq(chatSessions.courseId, courseId),
      ))
      .limit(1);
    if (!session) throw new Error(CHAT_SESSION_ACCESS_DENIED);
    return session.id;
  }
  return getOrCreateChatSession(userId, courseId, title);
}

async function requireEnrolledTutorAccess(courseId: string | null | undefined): Promise<TutorCourseAuthorization> {
  const authorization = await requireCourseAccess(courseId);
  if (authorization.access?.tier === "free") throw new Error(UPGRADE_REQUIRED);
  return authorization;
}

function assertFreeScope(access: CourseAccessResult | null, chapterIds: readonly (string | null | undefined)[]): void {
  if (access?.tier === "free" && !isFreeChapterScoped(
    chapterIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0),
    access.freeChapterIds,
  )) {
    throw new Error(UPGRADE_REQUIRED);
  }
}

async function chapterIdForKnowledgeObject(koId: string): Promise<string | null> {
  const [row] = await db
    .select({ chapterId: knowledgeObjects.chapterId })
    .from(knowledgeObjects)
    .where(eq(knowledgeObjects.id, koId))
    .limit(1);
  return row?.chapterId ?? null;
}

async function courseIdForChapter(chapterId: string): Promise<string | null> {
  const [canonical] = await db
    .select({ courseId: mataKuliah.id })
    .from(bab)
    .innerJoin(mataKuliah, eq(bab.mataKuliahId, mataKuliah.id))
    .where(or(eq(bab.id, chapterId), eq(bab.legacyChapterId, chapterId)))
    .limit(1);
  if (canonical) return canonical.courseId;
  const [legacy] = await db
    .select({ courseId: chapters.courseId })
    .from(chapters)
    .where(eq(chapters.id, chapterId))
    .limit(1);
  return legacy?.courseId ?? null;
}

async function courseIdForKO(koId: string): Promise<string | null> {
  const [row] = await db
    .select({ courseId: knowledgeObjects.courseId })
    .from(knowledgeObjects)
    .where(eq(knowledgeObjects.id, koId))
    .limit(1);
  return row?.courseId ?? null;
}

async function courseIdForQuestion(questionId: string): Promise<string | null> {
  const [row] = await db
    .select({ courseId: aiQuestionBank.courseId })
    .from(aiQuestionBank)
    .where(eq(aiQuestionBank.id, questionId))
    .limit(1);
  return row?.courseId ?? null;
}

function snapshotQuestions(value: unknown): Array<Record<string, unknown>> {
  const parsed = typeof value === "string"
    ? (() => {
        try {
          return JSON.parse(value);
        } catch {
          return null;
        }
      })()
    : value;
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
}

function publicSnapshotOptionTexts(value: unknown): string[] {
  const options = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : [];

  return options.flatMap((option) => {
    if (typeof option === "string") return [option];
    if (!option || typeof option !== "object" || Array.isArray(option)) return [];
    const record = option as Record<string, unknown>;
    for (const key of ["text", "label", "value", "content"]) {
      if (typeof record[key] === "string") return [record[key] as string];
    }
    return [];
  });
}

export async function explainConceptAction(
  koId: string,
  mode: "content" | "analogy" | "simplification"
) {
  const { user } = await requireEnrolledTutorAccess(await courseIdForKO(koId));
  return TutorActionService.explainConcept(koId, user.id, mode);
}

export async function analyzeMistakeAction(
  questionId: string,
  userAnswerOrIndex: string | number,
  requestedAttemptId?: string | null,
) {
  // Resolve the owning course when the question lives in the AI question bank;
  // enforce the central course decision. Questions without a course owner
  // cannot be authorized because there is no scope decision to apply.
  const questionCourseId = await courseIdForQuestion(questionId);
  if (!questionCourseId) throw new Error(COURSE_SCOPE_REQUIRED);
  const authorization = await requireEnrolledTutorAccess(questionCourseId);
  const { user, access } = authorization;
  const identity = await resolveCourseIdentity(questionCourseId);
  const courseScopeIds = [...new Set([
    questionCourseId,
    access.courseId,
    access.canonicalCourseId,
    access.legacyCourseId,
    ...(identity?.allIds ?? []),
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
  if (courseScopeIds.length === 0) throw new Error(COURSE_SCOPE_REQUIRED);

  const attemptId = typeof requestedAttemptId === "string" ? requestedAttemptId.trim() : "";
  const attemptConditions = [
    eq(studentQuizAttempts.studentId, user.id),
    eq(studentQuizAttempts.status, "completed"),
    inArray(quizTemplates.courseId, courseScopeIds),
  ];
  if (attemptId) attemptConditions.push(eq(studentQuizAttempts.id, attemptId));
  const completedAttempts = await db
    .select({
      id: studentQuizAttempts.id,
      questionsSnapshot: studentQuizAttempts.questionsSnapshot,
    })
    .from(studentQuizAttempts)
    .innerJoin(quizTemplates, eq(studentQuizAttempts.templateId, quizTemplates.id))
    .where(and(...attemptConditions))
    .orderBy(desc(studentQuizAttempts.submittedAt), desc(studentQuizAttempts.startedAt));

  const matchingAttempt = completedAttempts.find((attempt) =>
    snapshotQuestions(attempt.questionsSnapshot).some((question) => question.id === questionId),
  );
  if (!matchingAttempt) throw new Error(MISTAKE_ATTEMPT_REQUIRED);

  const snapshotQuestion = snapshotQuestions(matchingAttempt.questionsSnapshot)
    .find((question) => question.id === questionId);
  const snapshotOptions = publicSnapshotOptionTexts(snapshotQuestion?.options);
  let selectedIndex = -1;

  if (typeof userAnswerOrIndex === "number") {
    selectedIndex = Number.isInteger(userAnswerOrIndex)
      && userAnswerOrIndex >= 0
      && userAnswerOrIndex < snapshotOptions.length
      ? userAnswerOrIndex
      : -1;
  } else if (
    userAnswerOrIndex === "(diskusi umum)" ||
    userAnswerOrIndex === "(tidak menjawab)"
  ) {
    selectedIndex = -1;
  } else {
    // Look up options in aiQuestionBank first
    try {
      const [dbQuestion] = await db
        .select()
        .from(aiQuestionBank)
        .where(eq(aiQuestionBank.id, questionId));

      let options: string[] = snapshotOptions;
      if (options.length === 0 && dbQuestion && Array.isArray(dbQuestion.options)) {
        options = publicSnapshotOptionTexts(dbQuestion.options);
      } else {
        // Fallback: look up in mock exams
        if (options.length === 0) {
          for (const exam of exams) {
            const q = exam.questions.find((quest: any) => quest.id === questionId);
            if (q && "options" in q) {
              options = publicSnapshotOptionTexts(q.options);
              break;
            }
          }
        }
      }

      if (options.length > 0) {
        // Find exact or trimmed match
        const cleanedAnswer = userAnswerOrIndex.trim().toLowerCase();
        const idx = options.findIndex(
          (opt) => opt.trim().toLowerCase() === cleanedAnswer
        );
        if (idx !== -1) {
          selectedIndex = idx;
        } else {
          // Fallback: try parsing index if it's a number string
          const parsed = parseInt(userAnswerOrIndex, 10);
          if (!isNaN(parsed) && parsed >= 0 && parsed < options.length) {
            selectedIndex = parsed;
          }
        }
      }
    } catch (e) {
      console.error("Error resolving selectedIndex for analyzeMistake:", e);
    }
  }

  return TutorActionService.analyzeMistake(questionId, selectedIndex, user.id);
}

export async function buildStudyPlanAction() {
  const user = await requireUser();
  return TutorActionService.buildStudyPlan(user.id);
}

export async function generatePracticeQuizAction(koId: string, difficulty: string) {
  await requireEnrolledTutorAccess(await courseIdForKO(koId));
  return TutorActionService.generatePracticeQuiz(koId, difficulty);
}

export async function reviewWeakConceptsAction() {
  const user = await requireUser();
  return TutorActionService.reviewWeakConcepts(user.id);
}

export async function startFlashcardReviewAction(koId: string) {
  const authorization = await requireCourseAccess(await courseIdForKO(koId));
  assertFreeScope(authorization.access, [await chapterIdForKnowledgeObject(koId)]);
  const { user } = authorization;
  return TutorActionService.startFlashcardReview(koId, user.id);
}

export async function openMaterialAction(chapterId: string, sectionId: string) {
  if (!chapterId || !sectionId) throw new Error(COURSE_SCOPE_REQUIRED);
  const authorization = await requireCourseAccess(await courseIdForChapter(chapterId));
  assertFreeScope(authorization.access, [chapterId]);
  return TutorActionService.openMaterial(chapterId, sectionId);
}

export async function findKoForMaterialSectionAction(courseId: string, selectedText: string) {
  const { access } = await requireCourseAccess(courseId);

  if (!selectedText || selectedText.trim().length < 3) {
    return { success: false, error: "Text too short" };
  }
  
  const text = selectedText.trim().toLowerCase();
  
  try {
    // Fetch KOs for this course
    const kos = await db
      .select()
      .from(knowledgeObjects)
      .where(
        and(
          eq(knowledgeObjects.courseId, courseId),
          eq(knowledgeObjects.status, "active")
        )
      );

    const visibleKos = access?.tier === "free"
      ? kos.filter((ko) => isFreeChapterScoped([ko.chapterId], access.freeChapterIds))
      : kos;

    // 1. Try exact or substring match on conceptName
    let bestMatch = visibleKos.find(ko => ko.conceptName.toLowerCase().includes(text) || text.includes(ko.conceptName.toLowerCase()));
    
    // 2. Try matching the title
    if (!bestMatch) {
      bestMatch = visibleKos.find(ko => ko.title.toLowerCase().includes(text) || text.includes(ko.title.toLowerCase()));
    }

    // 3. Try matching content keywords
    if (!bestMatch) {
      bestMatch = visibleKos.find(ko => ko.content.toLowerCase().includes(text));
    }

    if (bestMatch) {
      return { success: true, koId: bestMatch.id };
    }

    // Fallback: If no match found, check if there is any KO in this course at all
    if (visibleKos.length > 0) {
      return { success: true, koId: visibleKos[0].id };
    }
  } catch (e) {
    console.error("Error in findKoForMaterialSectionAction:", e);
  }

  return { success: false, error: "No KOs found for this course" };
}

/**
 * Resolves the human-readable course label for the drawer header so students
 * see an academic context (course title) instead of the internal slug.
 * Returns null when the course does not exist; the UI falls back to the slug.
 */
export async function getTutorCourseContextAction(courseId: string) {
  const { access } = await requireCourseAccess(courseId);
  return access.courseTitle;
}

export async function askTutorRagAction(
  courseId: string,
  chapterId: string | null,
  question: string,
  sessionId?: string | null,
  attachmentIds?: readonly string[],
  pagePath?: string | null,
  requestId?: string | null,
  selectionContext?: {
    snippet?: string;
    blockType?: string;
    surroundingText?: string;
    sectionTitle?: string;
    chapterTitle?: string;
    intent?: string;
  } | null,
  codingRequest?: unknown,
) {
  const { user, access } = await requireCourseAccess(courseId);
  const normalizedQuestion = typeof question === "string" ? question.trim() : "";
  if (!normalizedQuestion && !(attachmentIds && attachmentIds.length > 0)) {
    throw new Error("QUESTION_REQUIRED");
  }

  const sid = await requireOwnedChatSession(
    user.id,
    courseId,
    sessionId,
    normalizedQuestion.slice(0, 100),
  );
  const startTime = Date.now();
  const requestedAttachmentIds = attachmentIds ?? [];
  if (access?.tier === "free" && requestedAttachmentIds.length > 0) {
    throw new Error(FREE_TEXT_ONLY);
  }
  assertZyraImageCount(requestedAttachmentIds.length);
  if (requestedAttachmentIds.length > 0 && !isZyraImageFeatureEnabled(zyraRuntimeEnv.FEATURE_ZYRA_IMAGE_INPUT_V1)) {
    throw new Error("IMAGE_INPUT_DISABLED");
  }
  const imageParts = requestedAttachmentIds.length > 0
    ? await loadZyraImageParts({
        ids: requestedAttachmentIds,
        studentId: user.id,
        courseId,
        sessionId: sid,
        promptBytes: new TextEncoder().encode(normalizedQuestion).byteLength,
      })
    : [];

  let resolvedChapterId = chapterId;
  if (access?.tier === "free" && resolvedChapterId) {
    const koChapterId = await chapterIdForKnowledgeObject(resolvedChapterId);
    if (koChapterId) resolvedChapterId = koChapterId;
    assertFreeScope(access, [resolvedChapterId]);
  }

  const normalizedRequestId = typeof requestId === "string" && /^[A-Za-z0-9._:-]{1,96}$/.test(requestId)
    ? requestId
    : randomUUID();
  const idempotencyKey = access?.tier === "free"
    ? `${FREE_ALLOWANCE_IDEMPOTENCY_PREFIX}${normalizedRequestId.replace(/^zyra-free:/, "")}`
    : `zyra:${normalizedRequestId.replace(/^zyra:/, "")}`;

  // Quiz templates still use the legacy course foreign key during the
  // compatibility window. Scope the guard to the fully resolved identity so
  // a canonical URL cannot miss an active attempt, while an unrelated course
  // with a colliding ID cannot satisfy it.
  const courseIdentity = await resolveCourseIdentity(courseId);
  if (!courseIdentity) throw new Error(COURSE_SCOPE_REQUIRED);
  const courseScopeIds = [...new Set([
    courseId,
    access.courseId,
    access.canonicalCourseId,
    access.legacyCourseId,
    courseIdentity.primaryId,
    courseIdentity.canonicalId,
    courseIdentity.legacyId,
    ...(courseIdentity.allIds ?? []),
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
  const courseScopeCondition = inArray(quizTemplates.courseId, courseScopeIds);

  const activeAttempt = await db
    .select({ id: studentQuizAttempts.id, questionsSnapshot: studentQuizAttempts.questionsSnapshot })
    .from(studentQuizAttempts)
    .innerJoin(quizTemplates, eq(studentQuizAttempts.templateId, quizTemplates.id))
    .where(and(
      eq(studentQuizAttempts.studentId, user.id),
      courseScopeCondition,
      eq(studentQuizAttempts.status, "in_progress"),
    ))
    .limit(1);

  const hasActiveAttempt = activeAttempt.length > 0;
  let protectedAnswers: { correctOptions?: string[]; explanationText?: string } | undefined;

  if (hasActiveAttempt && activeAttempt[0].questionsSnapshot && Array.isArray(activeAttempt[0].questionsSnapshot)) {
    const correctOptions: string[] = [];
    const explanations: string[] = [];
    for (const q of activeAttempt[0].questionsSnapshot as any[]) {
      if (q && Array.isArray(q.options) && Array.isArray(q.correct_indices)) {
        for (const idx of q.correct_indices) {
          if (typeof q.options[idx] === "string") {
            correctOptions.push(q.options[idx]);
          }
        }
      }
      if (q && typeof q.explanation === "string" && q.explanation.trim().length > 0) {
        explanations.push(q.explanation);
      }
    }
    protectedAnswers = {
      correctOptions,
      explanationText: explanations.join(" "),
    };
  }

  let pageContext: TutorPageContext | null = null;
  const reviewMatch = requestedAttachmentIds.length === 0
    ? pagePath?.match(/^\/courses\/([^/]+)\/my-results\/([^/]+)(?:\/.*)?$/)
    : null;
  if (reviewMatch && courseScopeIds.some((scopeId) => scopeId.toLowerCase() === reviewMatch[1].toLowerCase())) {
    const attemptId = reviewMatch[2];
    const [reviewAttempt] = await db
      .select({
        id: studentQuizAttempts.id,
        title: quizTemplates.title,
        questionsSnapshot: studentQuizAttempts.questionsSnapshot,
        strongAreas: studentQuizAttempts.strongAreas,
        weakAreas: studentQuizAttempts.weakAreas,
      })
      .from(studentQuizAttempts)
      .innerJoin(quizTemplates, eq(studentQuizAttempts.templateId, quizTemplates.id))
      .where(and(
        eq(studentQuizAttempts.id, attemptId),
        eq(studentQuizAttempts.studentId, user.id),
        inArray(quizTemplates.courseId, courseScopeIds),
      ))
      .limit(1);

    if (reviewAttempt) {
      const questions = Array.isArray(reviewAttempt.questionsSnapshot)
        ? reviewAttempt.questionsSnapshot
            .slice(0, 30)
            .map((item, index) => {
              const questionItem = item as Record<string, unknown>;
              const prompt = [questionItem.prompt, questionItem.questionText, questionItem.text]
                .find((value): value is string => typeof value === "string" && value.trim().length > 0);
              return prompt ? `${index + 1}. ${prompt.trim().slice(0, 800)}` : null;
            })
            .filter((value): value is string => value !== null)
        : [];
      const strongAreas = Array.isArray(reviewAttempt.strongAreas) ? reviewAttempt.strongAreas : [];
      const weakAreas = Array.isArray(reviewAttempt.weakAreas) ? reviewAttempt.weakAreas : [];
      pageContext = {
        id: `quiz-review-${reviewAttempt.id}`,
        label: `Pembahasan ${reviewAttempt.title}`,
        href: `/courses/${courseId}/my-results/${reviewAttempt.id}`,
        content: [
          "Konteks halaman saat ini adalah pembahasan kuis yang telah dikerjakan murid.",
          `Judul kuis: ${reviewAttempt.title}`,
          questions.length > 0 ? `Daftar soal:\n${questions.join("\n")}` : "Daftar soal tidak tersedia.",
          strongAreas.length > 0 ? `Area kuat: ${strongAreas.join(", ")}` : "",
          weakAreas.length > 0 ? `Area yang perlu dipelajari: ${weakAreas.join(", ")}` : "",
        ].filter(Boolean).join("\n\n"),
      };
    }
  }

  const materialMatch = requestedAttachmentIds.length === 0
    ? pagePath?.match(/^\/courses\/([^/]+)\/material\/([^/]+)(?:\/.*)?$/)
    : null;
  if (materialMatch && courseScopeIds.some((scopeId) => scopeId.toLowerCase() === materialMatch[1].toLowerCase())) {
    const rawMaterialId = decodeURIComponent(materialMatch[2]);
    try {
      const canonicalArticle = await getCanonicalPublishedArticle(courseId, rawMaterialId, user.id);
      if (canonicalArticle) {
        if (!resolvedChapterId && canonicalArticle.chapterId) {
          resolvedChapterId = canonicalArticle.chapterId;
        }
        pageContext = {
          id: `article-${canonicalArticle.id}`,
          label: `Materi: ${canonicalArticle.title}`,
          href: pagePath ?? `/courses/${courseId}/material/${canonicalArticle.id}`,
          content: [
            `Materi Kuliah: "${canonicalArticle.title}"`,
            (canonicalArticle as any).learningObjective ? `Tujuan pembelajaran: ${(canonicalArticle as any).learningObjective}` : "",
            canonicalArticle.sections.length > 0
              ? canonicalArticle.sections
                  .slice(0, 10)
                  .map((s, idx) => {
                    const sectionBody = s.blocks?.map((b) => b.content).filter(Boolean).join("\n") || s.learningObjective || "";
                    return `Subtopik ${idx + 1}: ${s.title}${sectionBody ? `\n${sectionBody}` : ""}`;
                  })
                  .join("\n\n")
              : "",
          ].filter(Boolean).join("\n\n").slice(0, 4000),
        };
      } else {
        const textProduct = await getCanonicalPublishedTextProduct(courseId, rawMaterialId);
        if (textProduct) {
          if (!resolvedChapterId && textProduct.chapterId) {
            resolvedChapterId = textProduct.chapterId;
          }
          pageContext = {
            id: `text-product-${textProduct.id}`,
            label: `Materi: ${textProduct.title}`,
            href: pagePath ?? `/courses/${courseId}/material/${textProduct.id}`,
            content: `Materi/diktat: "${textProduct.title}"\n\n${(textProduct as any).content || ""}`.slice(0, 4000),
          };
        } else {
          const [mat] = await db
            .select({
              id: courseMaterials.id,
              title: courseMaterials.title,
              chapterIds: courseMaterials.chapterIds,
            })
            .from(courseMaterials)
            .where(eq(courseMaterials.id, rawMaterialId))
            .limit(1);

          if (mat) {
            const firstChapter = Array.isArray(mat.chapterIds) ? mat.chapterIds[0] : null;
            if (!resolvedChapterId && firstChapter) {
              resolvedChapterId = firstChapter;
            }
            pageContext = {
              id: `material-${mat.id}`,
              label: `Materi: ${mat.title}`,
              href: pagePath ?? `/courses/${courseId}/material/${mat.id}`,
              content: `Materi: "${mat.title}"`,
            };
          }
        }
      }
    } catch (err) {
      console.error("Error resolving material page context:", err);
    }
  }

  const conceptMatch = !pageContext && requestedAttachmentIds.length === 0
    ? pagePath?.match(/^\/courses\/([^/]+)\/concept\/([^/]+)(?:\/.*)?$/)
    : null;
  if (conceptMatch && courseScopeIds.some((scopeId) => scopeId.toLowerCase() === conceptMatch[1].toLowerCase())) {
    const rawKoId = decodeURIComponent(conceptMatch[2]);
    try {
      const [ko] = await db
        .select({
          id: knowledgeObjects.id,
          conceptName: knowledgeObjects.conceptName,
          title: knowledgeObjects.title,
          chapterId: knowledgeObjects.chapterId,
          content: knowledgeObjects.content,
        })
        .from(knowledgeObjects)
        .where(eq(knowledgeObjects.id, rawKoId))
        .limit(1);

      if (ko) {
        if (!resolvedChapterId && ko.chapterId) {
          resolvedChapterId = ko.chapterId;
        }
        pageContext = {
          id: `concept-${ko.id}`,
          label: `Konsep: ${ko.conceptName}`,
          href: pagePath ?? `/courses/${courseId}/concept/${ko.id}`,
          content: [
            `Konsep: "${ko.conceptName}" (${ko.title})`,
            ko.content ? `Rangkuman konsep: ${ko.content.slice(0, 500)}` : "",
          ].filter(Boolean).join("\n\n"),
        };
      }
    } catch (err) {
      console.error("Error resolving concept page context:", err);
    }
  }

  if (selectionContext?.snippet) {
    const contextLines: string[] = [];
    if (selectionContext.sectionTitle || selectionContext.chapterTitle) {
      contextLines.push(
        `Bagian: ${[selectionContext.chapterTitle, selectionContext.sectionTitle].filter(Boolean).join(" - ")}`
      );
    }
    contextLines.push(`Teks yang ditanyakan: "${selectionContext.snippet}"`);
    if (selectionContext.surroundingText) {
      contextLines.push(`Konteks sekitar materi:\n${selectionContext.surroundingText}`);
    }

    if (pageContext) {
      pageContext = {
        ...pageContext,
        content: `${contextLines.join("\n\n")}\n\n---\n\n${pageContext.content}`.slice(0, 5000),
      };
    } else {
      pageContext = {
        id: `selection-${Date.now()}`,
        label: selectionContext.sectionTitle || selectionContext.chapterTitle || "Kutipan Materi",
        href: pagePath ?? `/courses/${courseId}/material`,
        content: contextLines.join("\n\n"),
      };
    }
  }

  let effectiveQuestion = normalizedQuestion;
  if (selectionContext?.snippet && !effectiveQuestion.includes(selectionContext.snippet)) {
    effectiveQuestion = effectiveQuestion
      ? `${effectiveQuestion}\n\nKutipan materi: "${selectionContext.snippet}"`
      : `Jelaskan kutipan materi: "${selectionContext.snippet}"`;
  }

  let codingHintOnly = false;
  let codingPedagogyAction: "hint_request" | "follow_up" | undefined;
  if (codingRequest) {
    if ((codingRequest as { kind?: unknown }).kind === "exercise" && access.tier !== "enrolled" && access.tier !== "staff") throw new Error("NOT_ENROLLED");
    if (!access.canonicalCourseId) throw new Error("COURSE_SCOPE_REQUIRED");
    const coding = await resolveCodingTutorContext({ courseId: access.canonicalCourseId, userId: user.id, request: codingRequest });
    codingHintOnly = coding.assistance === "hints";
    codingPedagogyAction = codingHintOnly || (codingRequest as { intent?: unknown }).intent === "hint"
      ? "hint_request" : "follow_up";
    if (codingHintOnly && coding.protectedSolution) protectedAnswers = { ...protectedAnswers, explanationText: [protectedAnswers?.explanationText, coding.protectedSolution].filter(Boolean).join("\n") };
    const memory = await getConversationMemory({ studentId: user.id, courseId, sessionId: sid, limit: 4 });
    const recentConversation = memory.recentMessages
      .filter((message) => !codingHintOnly || message.role === "student")
      .map((message) => ({ role: message.role, content: message.content.slice(0, 600) }));
    pageContext = { id: `coding:${user.id}:${sid}`, label: "Python", href: pagePath ?? `/courses/${courseId}/playground`, content: `${CODING_TUTOR_INSTRUCTIONS}\n\n${JSON.stringify({ ...coding.context, recentConversation })}` };
  }

  const result = await askTutorRag({
    studentId: user.id,
    courseId,
    chapterId: resolvedChapterId,
    question: effectiveQuestion,
    sessionId: sid,
    accessTier: access?.tier === "free" ? "free" : "standard",
    freeChapterIds: access?.freeChapterIds,
    idempotencyKey,
    attemptState: hasActiveAttempt || codingHintOnly ? "in_progress" : "none",
    activityKind: hasActiveAttempt || codingHintOnly ? "quiz" : "study",
    matchState: codingHintOnly ? "strong" : undefined,
    answerReleaseState: codingHintOnly ? "hidden" : undefined,
    protectedAnswers,
    imageParts,
    pageContext,
    pedagogyAction: codingPedagogyAction,
  });

  if (requestedAttachmentIds.length > 0 && result.answer) {
    await markZyraAttachmentsDispatched(requestedAttachmentIds, user.id);
  }

  return {
    ...result,
    sessionId: sid,
    processingTimeMs: Date.now() - startTime,
  };
}

const CHAT_HISTORY_LIMIT = 100;

export async function saveTutorMessagesAction(
  courseId: string,
  messages: Array<{ role: "student" | "ai"; content: string; sources?: unknown; canvasSpec?: unknown; attachmentIds?: readonly string[] }>,
  sessionId?: string | null
) {
  const { user, access } = await requireCourseAccess(courseId);

  const providedSessionId = typeof sessionId === "string" ? sessionId.trim() : "";
  if (!messages.length) {
    if (providedSessionId) {
      await requireOwnedChatSession(user.id, courseId, providedSessionId, "General Chat");
    }
    return { success: true };
  }

  if (access?.tier === "free" && messages.some((message) => (message.attachmentIds?.length ?? 0) > 0)) {
    throw new Error(FREE_TEXT_ONLY);
  }

  const sid = await requireOwnedChatSession(user.id, courseId, providedSessionId, "General Chat");

  const preparedRows = messages.map((m) => {
    const rawSources = Array.isArray(m.sources) ? m.sources : [];
    const content = m.role === "ai"
      ? sanitizeAnswer(m.content ?? "", rawSources as any)
      : (m.content ?? "");
    return {
      id: randomUUID(),
      studentId: user.id,
      courseId,
      sessionId: sid,
      role: m.role,
      content,
      sources: access?.tier === "free"
        ? null
        : serializeTutorMessageSources(
            m.sources,
            isZyraCanvasFeatureEnabled() ? m.canvasSpec : undefined,
          ),
      attachmentIds: m.role === "student" ? [...(m.attachmentIds ?? [])] : [],
    };
  });

  for (const row of preparedRows) assertZyraImageCount(row.attachmentIds.length);

  await db.transaction(async (tx) => {
    await tx.insert(tutorChatMessages).values(preparedRows.map(({ attachmentIds: _attachmentIds, ...row }) => row));
    for (const row of preparedRows) {
      if (row.attachmentIds.length === 0) continue;
      for (const attachmentId of row.attachmentIds) {
        const linked = await tx.update(zyraMessageAttachments)
          .set({ messageId: row.id })
          .where(and(
            eq(zyraMessageAttachments.id, attachmentId),
            eq(zyraMessageAttachments.studentId, user.id),
            eq(zyraMessageAttachments.courseId, courseId),
            eq(zyraMessageAttachments.sessionId, sid),
            gt(zyraMessageAttachments.expiresAt, new Date()),
            or(isNull(zyraMessageAttachments.messageId), eq(zyraMessageAttachments.messageId, row.id)),
          ));
        if (linked.rowsAffected !== 1) throw new Error("ZYRA_ATTACHMENT_LINK_FAILED");
      }
    }
  });

  await db
    .update(chatSessions)
    .set({ lastMessageAt: new Date() })
    .where(and(
      eq(chatSessions.id, sid),
      eq(chatSessions.studentId, user.id),
      eq(chatSessions.courseId, courseId),
    ));

  const rows = await db
    .select({ id: tutorChatMessages.id })
    .from(tutorChatMessages)
    .where(
      and(
        eq(tutorChatMessages.studentId, user.id),
        eq(tutorChatMessages.courseId, courseId),
        eq(tutorChatMessages.sessionId, sid)
      )
    )
    .orderBy(desc(tutorChatMessages.createdAt));

  if (rows.length > CHAT_HISTORY_LIMIT) {
    const toDelete = rows.slice(CHAT_HISTORY_LIMIT).map((r) => r.id);
    if (toDelete.length > 0) {
      await db.delete(tutorChatMessages).where(inArray(tutorChatMessages.id, toDelete));
    }
  }

  return { success: true, sessionId: sid };
}

export async function loadTutorHistoryAction(
  courseId: string,
  sessionId?: string | null
) {
  const { user, access } = await requireCourseAccess(courseId);

  const sid = await requireOwnedChatSession(user.id, courseId, sessionId, "General Chat");

  const conditions = [
    eq(tutorChatMessages.studentId, user.id),
    eq(tutorChatMessages.courseId, courseId),
    eq(tutorChatMessages.sessionId, sid),
  ];

  const rows = await db
    .select()
    .from(tutorChatMessages)
    .where(and(...conditions))
    .orderBy(asc(tutorChatMessages.createdAt))
    .limit(CHAT_HISTORY_LIMIT);

  const messageIds = rows.map((row) => row.id);
  const attachmentRows = access?.tier !== "free"
    && messageIds.length > 0
    && isZyraImageFeatureEnabled(zyraRuntimeEnv.FEATURE_ZYRA_IMAGE_INPUT_V1)
    ? await db
        .select({
          id: zyraMessageAttachments.id,
          messageId: zyraMessageAttachments.messageId,
          mimeType: zyraMessageAttachments.mimeType,
          width: zyraMessageAttachments.width,
          height: zyraMessageAttachments.height,
        })
        .from(zyraMessageAttachments)
        .where(and(
          inArray(zyraMessageAttachments.messageId, messageIds),
          eq(zyraMessageAttachments.studentId, user.id),
          eq(zyraMessageAttachments.courseId, courseId),
          eq(zyraMessageAttachments.sessionId, sid),
          gt(zyraMessageAttachments.expiresAt, new Date()),
          inArray(zyraMessageAttachments.status, ["uploaded", "attached", "dispatched"]),
        ))
    : [];
  const attachmentsByMessage = new Map<string, typeof attachmentRows>();
  for (const attachment of attachmentRows) {
    if (!attachment.messageId) continue;
    const current = attachmentsByMessage.get(attachment.messageId) ?? [];
    current.push(attachment);
    attachmentsByMessage.set(attachment.messageId, current);
  }

  return {
    sessionId: sid,
    messages: rows.map((r) => {
      const decoded = deserializeTutorMessageSources(r.sources);
      const content = r.role === "ai"
        ? sanitizeAnswer(r.content, decoded.sources)
        : r.content;
      return {
        id: r.id,
        role: r.role as "student" | "ai",
        content,
        sources: access?.tier === "free"
          ? undefined
          : decoded.sources.length > 0 ? decoded.sources : undefined,
        canvasSpec: access?.tier === "free"
          ? undefined
          : isZyraCanvasFeatureEnabled() ? decoded.canvasSpec : undefined,
        attachments: attachmentsByMessage.get(r.id)?.map((attachment) => ({
          id: attachment.id,
          mimeType: attachment.mimeType as ZyraImageMime,
          width: attachment.width,
          height: attachment.height,
        })) ?? [],
      };
    }),
  };
}

export async function clearTutorHistoryAction(
  courseId: string,
  sessionId?: string | null
) {
  const { user } = await requireCourseAccess(courseId);
  const providedSessionId = typeof sessionId === "string" ? sessionId.trim() : "";
  if (providedSessionId) {
    await requireOwnedChatSession(user.id, courseId, providedSessionId, "General Chat");
  }

  const conditions = [
    eq(tutorChatMessages.studentId, user.id),
    eq(tutorChatMessages.courseId, courseId),
  ];
  if (providedSessionId) {
    conditions.push(eq(tutorChatMessages.sessionId, providedSessionId));
  }

  await db.delete(tutorChatMessages).where(and(...conditions));

  if (providedSessionId) {
    await db.delete(chatSessions).where(and(
      eq(chatSessions.id, providedSessionId),
      eq(chatSessions.studentId, user.id),
      eq(chatSessions.courseId, courseId),
    ));
  }

  return { success: true };
}

export async function listTutorSessionsAction(courseId: string) {
  const { user } = await requireCourseAccess(courseId);
  const rows = await db
    .select({
      id: chatSessions.id,
      title: chatSessions.title,
      startedAt: chatSessions.startedAt,
      lastMessageAt: chatSessions.lastMessageAt,
      messageCount: sql<number>`(
        select count(*) from ${tutorChatMessages}
        where ${tutorChatMessages.sessionId} = ${chatSessions.id}
      )`,
    })
    .from(chatSessions)
    .where(and(
      eq(chatSessions.studentId, user.id),
      eq(chatSessions.courseId, courseId),
    ))
    .orderBy(desc(chatSessions.lastMessageAt))
    .limit(30);

  return rows.map((r) => ({
    id: r.id,
    title: r.title || "Percakapan",
    lastMessageAt: r.lastMessageAt ? new Date(r.lastMessageAt).toISOString() : null,
    messageCount: Number(r.messageCount || 0),
  }));
}

export async function quickExplainSnippetAction(input: {
  courseId: string;
  snippet: string;
  sectionTitle?: string;
  chapterTitle?: string;
  blockType?: string;
  intent?: "define" | "simplify" | "step_by_step" | "intuition";
}) {
  const normalizedSnippet = input.snippet.trim().slice(0, 600);
  if (!normalizedSnippet) {
    return { success: false, error: "Snippet kosong." };
  }

  let promptInstruction = "";
  if (input.intent === "define") {
    promptInstruction = `Jelaskan secara singkat definisi dan arti dari istilah atau simbol "${normalizedSnippet}" dalam materi ${input.sectionTitle || input.chapterTitle || "kuliah"}. Jawaban harus maksimal 2 sampai 3 kalimat pendek dan jika relevan sertakan contoh singkat atau formula matematis dengan KaTeX ($...$).`;
  } else if (input.intent === "intuition") {
    promptInstruction = `Jelaskan intuisi dasar atau analogi sederhana di balik pernyataan "${normalizedSnippet}" agar mahasiswa langsung memahaminya. Maksimal 3 kalimat pendek.`;
  } else if (input.intent === "step_by_step") {
    promptInstruction = `Jelaskan logika atau alasan di balik langkah perhitungan "${normalizedSnippet}". Maksimal 3 kalimat pendek.`;
  } else {
    promptInstruction = `Jelaskan intisari dari "${normalizedSnippet}" secara sederhana dan padat (maksimal 2-3 kalimat).`;
  }

  try {
    const res = await askTutorRagAction(
      input.courseId,
      null,
      promptInstruction,
      null,
      [],
      null,
      null,
      {
        snippet: normalizedSnippet,
        blockType: input.blockType,
        sectionTitle: input.sectionTitle,
        chapterTitle: input.chapterTitle,
        intent: input.intent,
      }
    );

    return {
      success: true,
      explanation: res.answer ? sanitizeAnswer(res.answer, res.sources) : "Tidak ada penjelasan yang tersedia.",
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Gagal memuat penjelasan singkat.";
    return {
      success: false,
      error: errorMsg,
    };
  }
}

