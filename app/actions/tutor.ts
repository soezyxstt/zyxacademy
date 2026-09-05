"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { TutorActionService } from "@/lib/tutor-actions";
import { db } from "@/db";
import { aiQuestionBank, knowledgeObjects, tutorChatMessages, chatSessions, studentQuizAttempts, quizTemplates, zyraMessageAttachments, courses } from "@/db/schema";
import { eq, and, asc, desc, gt, inArray, isNull, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { exams } from "@/lib/student-course-fixtures";
import { askTutorRag, type TutorPageContext } from "@/lib/tutor-rag";
import { getOrCreateChatSession } from "@/lib/zyra/zyra-context-builder";
import { isEnrolled } from "@/lib/course-utils";
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

/** Thrown when a signed-in user tries to use Zyra for a course they are not enrolled in. */
const NOT_ENROLLED = "NOT_ENROLLED";

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

/**
 * Zyra is enrollment-gated: only students enrolled in a course (and admins) may
 * invoke tutor actions scoped to it. Course-scoped actions resolve the course
 * either directly (courseId arg) or via the referenced KO/question, then check
 * enrollment. Keeps AI spend and course content behind the enrollment wall.
 */
async function requireCourseAccess(courseId: string | null | undefined) {
  const user = await requireUser();
  if ((user as { role?: string | null }).role === "admin") return user;
  if (!courseId || !(await isEnrolled(user.id, courseId))) {
    throw new Error(NOT_ENROLLED);
  }
  return user;
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

export async function explainConceptAction(
  koId: string,
  mode: "content" | "analogy" | "simplification"
) {
  const user = await requireCourseAccess(await courseIdForKO(koId));
  return TutorActionService.explainConcept(koId, user.id, mode);
}

export async function analyzeMistakeAction(
  questionId: string,
  userAnswerOrIndex: string | number
) {
  // Resolve the owning course when the question lives in the AI question bank;
  // enforce enrollment when known. Questions sourced elsewhere (e.g. fixtures)
  // cannot be resolved, so they fall back to a plain auth check.
  const questionCourseId = await courseIdForQuestion(questionId);
  const user = questionCourseId
    ? await requireCourseAccess(questionCourseId)
    : await requireUser();
  let selectedIndex = -1;

  if (typeof userAnswerOrIndex === "number") {
    selectedIndex = userAnswerOrIndex;
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

      let options: string[] = [];
      if (dbQuestion && Array.isArray(dbQuestion.options)) {
        options = dbQuestion.options as string[];
      } else {
        // Fallback: look up in mock exams
        for (const exam of exams) {
          const q = exam.questions.find((quest: any) => quest.id === questionId);
          if (q && "options" in q) {
            options = q.options;
            break;
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
  await requireCourseAccess(await courseIdForKO(koId));
  return TutorActionService.generatePracticeQuiz(koId, difficulty);
}

export async function reviewWeakConceptsAction() {
  const user = await requireUser();
  return TutorActionService.reviewWeakConcepts(user.id);
}

export async function startFlashcardReviewAction(koId: string) {
  const user = await requireCourseAccess(await courseIdForKO(koId));
  return TutorActionService.startFlashcardReview(koId, user.id);
}

export async function openMaterialAction(chapterId: string, sectionId: string) {
  await requireUser();
  return TutorActionService.openMaterial(chapterId, sectionId);
}

export async function findKoForMaterialSectionAction(courseId: string, selectedText: string) {
  await requireCourseAccess(courseId);

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

    // 1. Try exact or substring match on conceptName
    let bestMatch = kos.find(ko => ko.conceptName.toLowerCase().includes(text) || text.includes(ko.conceptName.toLowerCase()));
    
    // 2. Try matching the title
    if (!bestMatch) {
      bestMatch = kos.find(ko => ko.title.toLowerCase().includes(text) || text.includes(ko.title.toLowerCase()));
    }

    // 3. Try matching content keywords
    if (!bestMatch) {
      bestMatch = kos.find(ko => ko.content.toLowerCase().includes(text));
    }

    if (bestMatch) {
      return { success: true, koId: bestMatch.id };
    }

    // Fallback: If no match found, check if there is any KO in this course at all
    if (kos.length > 0) {
      return { success: true, koId: kos[0].id };
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
  await requireUser();
  const [row] = await db
    .select({ title: courses.title })
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);
  return row?.title ?? null;
}

export async function askTutorRagAction(
  courseId: string,
  chapterId: string | null,
  question: string,
  sessionId?: string | null,
  attachmentIds?: readonly string[],
  pagePath?: string | null,
) {
  const user = await requireCourseAccess(courseId);

  const sid = sessionId ?? await getOrCreateChatSession(user.id, courseId, question.slice(0, 100));
  const startTime = Date.now();
  const requestedAttachmentIds = attachmentIds ?? [];
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
        promptBytes: new TextEncoder().encode(question).byteLength,
      })
    : [];

  const activeAttempt = await db
    .select({ id: studentQuizAttempts.id, questionsSnapshot: studentQuizAttempts.questionsSnapshot })
    .from(studentQuizAttempts)
    .innerJoin(quizTemplates, eq(studentQuizAttempts.templateId, quizTemplates.id))
    .where(and(eq(studentQuizAttempts.studentId, user.id), eq(quizTemplates.courseId, courseId), eq(studentQuizAttempts.status, "in_progress")))
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
  if (reviewMatch?.[1] === courseId) {
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
        eq(quizTemplates.courseId, courseId),
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

  const result = await askTutorRag({
    studentId: user.id,
    courseId,
    chapterId,
    question,
    sessionId: sid,
    attemptState: hasActiveAttempt ? "in_progress" : "none",
    activityKind: hasActiveAttempt ? "quiz" : "study",
    protectedAnswers,
    imageParts,
    pageContext,
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
  const user = await requireCourseAccess(courseId);

  if (!messages.length) return { success: true };

  const sid = sessionId ?? await getOrCreateChatSession(user.id, courseId, "General Chat");

  const preparedRows = messages.map((m) => ({
      id: randomUUID(),
      studentId: user.id,
      courseId,
      sessionId: sid,
      role: m.role,
      content: m.content ?? "",
      sources: serializeTutorMessageSources(
        m.sources,
        isZyraCanvasFeatureEnabled() ? m.canvasSpec : undefined,
      ),
      attachmentIds: m.role === "student" ? [...(m.attachmentIds ?? [])] : [],
    }));

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
    .where(eq(chatSessions.id, sid));

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
  const user = await requireCourseAccess(courseId);

  const sid = sessionId ?? await getOrCreateChatSession(user.id, courseId, "General Chat");

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
  const attachmentRows = messageIds.length > 0 && isZyraImageFeatureEnabled(zyraRuntimeEnv.FEATURE_ZYRA_IMAGE_INPUT_V1)
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
      return {
        id: r.id,
        role: r.role as "student" | "ai",
        content: r.content,
        sources: decoded.sources.length > 0 ? decoded.sources : undefined,
        canvasSpec: isZyraCanvasFeatureEnabled() ? decoded.canvasSpec : undefined,
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
  const user = await requireCourseAccess(courseId);

  const conditions = [
    eq(tutorChatMessages.studentId, user.id),
    eq(tutorChatMessages.courseId, courseId),
  ];
  if (sessionId) {
    conditions.push(eq(tutorChatMessages.sessionId, sessionId));
  }

  await db.delete(tutorChatMessages).where(and(...conditions));

  if (sessionId) {
    await db.delete(chatSessions).where(eq(chatSessions.id, sessionId));
  }

  return { success: true };
}
