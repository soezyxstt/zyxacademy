"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  flashcards,
  flashcardSets,
  aiQuestionBank,
  knowledgeObjects,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { canAccessCourseContent, resolveCourseAccess } from "@/lib/student/course-access";

type KnowledgeObjectAccess = {
  courseId: string;
  chapterId: string;
};

function publicOptionTexts(value: unknown): string[] {
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

  return options
    .map((option) => {
      if (typeof option === "string") return option;
      if (!option || typeof option !== "object" || Array.isArray(option)) return null;
      const record = option as Record<string, unknown>;
      for (const key of ["text", "label", "value", "content"]) {
        if (typeof record[key] === "string") return record[key];
      }
      return null;
    })
    .filter((option): option is string => option !== null);
}

/**
 * Resolves the KO owner before returning any tutor-side learning asset. The
 * drawer is authenticated, but server actions must not trust that UI boundary
 * because the action can be invoked directly.
 */
async function resolveKnowledgeObjectAccess(koId: string): Promise<KnowledgeObjectAccess | null> {
  if (typeof koId !== "string" || koId.trim().length === 0) return null;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return null;

  const [knowledgeObject] = await db
    .select({ courseId: knowledgeObjects.courseId, chapterId: knowledgeObjects.chapterId })
    .from(knowledgeObjects)
    .where(
      and(
        eq(knowledgeObjects.id, koId.trim()),
        eq(knowledgeObjects.status, "active"),
      ),
    )
    .limit(1);
  if (!knowledgeObject) return null;

  const access = await resolveCourseAccess({
    courseId: knowledgeObject.courseId,
    userId: session.user.id,
    roleHint: (session.user as { role?: string | null }).role,
  });
  if (!access.hasCourseAccess) return null;

  // Free users may only use tutor-side learning assets that belong to the
  // first two active chapters. Enrolled users and staff keep the previous
  // course-wide behavior of this action.
  if (
    access.tier === "free"
    && !canAccessCourseContent(access, "flashcard", [knowledgeObject.chapterId])
  ) {
    return null;
  }

  return {
    courseId: knowledgeObject.courseId,
    chapterId: knowledgeObject.chapterId,
  };
}

export async function getFlashcardsForKOAction(koId: string) {
  try {
    const access = await resolveKnowledgeObjectAccess(koId);
    if (!access) return [];

    const list = await db
      .select({
        id: flashcards.id,
        front: flashcards.front,
        back: flashcards.back,
        explanation: flashcards.explanation,
      })
      .from(flashcards)
      .innerJoin(flashcardSets, eq(flashcards.setId, flashcardSets.id))
      .where(
        and(
          eq(flashcards.koId, koId.trim()),
          eq(flashcardSets.courseId, access.courseId),
          eq(flashcards.status, "active"),
          eq(flashcardSets.status, "published"),
          eq(flashcardSets.isStale, false),
        ),
      );

    return list;
  } catch (e) {
    console.error("Error fetching flashcards:", e);
    return [];
  }
}

export async function getQuestionsForKOAction(koId: string) {
  try {
    const access = await resolveKnowledgeObjectAccess(koId);
    if (!access) return [];

    const list = await db
      .select({
        id: aiQuestionBank.id,
        prompt: aiQuestionBank.prompt,
        question: aiQuestionBank.prompt,
        rawOptions: aiQuestionBank.options,
      })
      .from(aiQuestionBank)
      .innerJoin(knowledgeObjects, eq(aiQuestionBank.knowledgeObjectId, knowledgeObjects.id))
      .where(
        and(
          eq(aiQuestionBank.knowledgeObjectId, koId.trim()),
          eq(aiQuestionBank.courseId, access.courseId),
          eq(aiQuestionBank.status, "active"),
          eq(aiQuestionBank.reviewStatus, "published"),
          eq(aiQuestionBank.isStale, false),
          eq(knowledgeObjects.status, "active"),
        )
      );

    return list.map(({ rawOptions, ...question }) => ({
      ...question,
      options: publicOptionTexts(rawOptions),
    }));
  } catch (e) {
    console.error("Error fetching bank questions:", e);
    return [];
  }
}
