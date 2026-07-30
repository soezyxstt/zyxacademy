"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { TutorActionService } from "@/lib/tutor-actions";
import { db } from "@/db";
import { aiQuestionBank, knowledgeObjects, tutorChatMessages, chatSessions } from "@/db/schema";
import { eq, and, asc, desc } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { exams } from "@/lib/student-course-fixtures";
import { askTutorRag } from "@/lib/tutor-rag";
import { getOrCreateChatSession } from "@/lib/zyra/zyra-context-builder";
import { isEnrolled } from "@/lib/course-utils";

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

export async function askTutorRagAction(
  courseId: string,
  chapterId: string | null,
  question: string,
  sessionId?: string | null
) {
  const user = await requireCourseAccess(courseId);

  const sid = sessionId ?? await getOrCreateChatSession(user.id, courseId, question.slice(0, 100));
  const startTime = Date.now();

  const activeAttempt = await db
    .select({ id: quizAttempts.id })
    .from(quizAttempts)
    .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
    .where(and(eq(quizAttempts.userId, user.id), eq(quizzes.courseId, courseId), eq(quizAttempts.isCompleted, false)))
    .limit(1);

  const hasActiveAttempt = activeAttempt.length > 0;

  const result = await askTutorRag({
    studentId: user.id,
    courseId,
    chapterId,
    question,
    sessionId: sid,
    attemptState: hasActiveAttempt ? "active" : "none",
    activityKind: hasActiveAttempt ? "quiz" : "study",
  });

  return {
    ...result,
    sessionId: sid,
    processingTimeMs: Date.now() - startTime,
  };
}

const CHAT_HISTORY_LIMIT = 100;

export async function saveTutorMessagesAction(
  courseId: string,
  messages: Array<{ role: "student" | "ai"; content: string; sources?: unknown }>,
  sessionId?: string | null
) {
  const user = await requireCourseAccess(courseId);

  if (!messages.length) return { success: true };

  const sid = sessionId ?? await getOrCreateChatSession(user.id, courseId, "General Chat");

  await db.insert(tutorChatMessages).values(
    messages.map((m) => ({
      id: randomUUID(),
      studentId: user.id,
      courseId,
      sessionId: sid,
      role: m.role,
      content: m.content ?? "",
      sources: m.sources ?? null,
    }))
  );

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
        eq(tutorChatMessages.courseId, courseId)
      )
    )
    .orderBy(desc(tutorChatMessages.createdAt));

  if (rows.length > CHAT_HISTORY_LIMIT) {
    const toDelete = rows.slice(CHAT_HISTORY_LIMIT).map((r) => r.id);
    for (const id of toDelete) {
      await db.delete(tutorChatMessages).where(eq(tutorChatMessages.id, id));
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

  return {
    sessionId: sid,
    messages: rows.map((r) => ({
      id: r.id,
      role: r.role as "student" | "ai",
      content: r.content,
      sources: r.sources as Array<{ type: string; id: string; label: string; href: string }> | undefined,
    })),
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
