import { randomUUID } from "node:crypto";
import { db } from "@/db";
import {
  dailyRecommendations,
  flashcards,
  flashcardSets,
  enrollments,
  studentFlashcardProgress,
  quizTemplates,
  studentQuizAttempts,
  websiteMaterials,
  chapters,
  studentChapterProgress,
  knowledgeObjects,
} from "@/db/schema";
import { getMastery } from "@/lib/mastery-store";
import { getOrComputeStudyPath } from "@/lib/study-path-service";
import { eq, and, or, lte, isNull, gt, gte, notInArray, asc, inArray } from "drizzle-orm";

export interface PlanItem {
  id: string;
  kind: "flashcards" | "quiz" | "module";
  title: string;
  count?: number;
  href: string;
}

interface Payload {
  items: PlanItem[];
}

import { todayUtc } from "@/lib/date-utils";

async function buildPlan(
  studentId: string,
  enrolledCourseIds: string[]
): Promise<PlanItem[]> {
  if (enrolledCourseIds.length === 0) return [];

  const now = new Date();
  const items: PlanItem[] = [];

  // ── a. Flashcards: due + new, capped at 20 ─────────────────────────────────
  const dueRows = await db
    .selectDistinct({ cardId: flashcards.id, courseId: flashcardSets.courseId })
    .from(flashcards)
    .innerJoin(flashcardSets, eq(flashcards.setId, flashcardSets.id))
    .innerJoin(
      enrollments,
      and(
        eq(flashcardSets.courseId, enrollments.courseId),
        eq(enrollments.userId, studentId),
        gt(enrollments.expiresAt, now)
      )
    )
    .leftJoin(
      studentFlashcardProgress,
      and(
        eq(studentFlashcardProgress.flashcardId, flashcards.id),
        eq(studentFlashcardProgress.studentId, studentId)
      )
    )
    .where(
      and(
        eq(flashcards.status, "active"),
        eq(flashcardSets.status, "published"),
        or(
          isNull(studentFlashcardProgress.id),
          lte(studentFlashcardProgress.dueDate, now)
        )
      )
    )
    .limit(20);

  if (dueRows.length > 0) {
    const courseId = dueRows[0].courseId;
    items.push({
      id: "flashcards",
      kind: "flashcards",
      title: "Review flashcards",
      count: dueRows.length,
      href: `/courses/${courseId}/flashcard`,
    });
  }

  // ── b. Quiz & c. Module picks (conditionally study path based) ──────────────
  let quizPicked = false;
  let modulePicked = false;
  let quizItem: PlanItem | null = null;
  let moduleItem: PlanItem | null = null;

  for (const courseId of enrolledCourseIds) {
    if (quizPicked && modulePicked) break;

      try {
        const path = await getOrComputeStudyPath(studentId, courseId);
        const activeStep = path.find(
          (step) => step.status === "available" || step.status === "in_progress"
        );

        if (activeStep) {
          // Quiz recommendation from path
          if (!quizPicked && activeStep.actions.quizTemplateId) {
            const [template] = await db
              .select({ id: quizTemplates.id, title: quizTemplates.title })
              .from(quizTemplates)
              .where(eq(quizTemplates.id, activeStep.actions.quizTemplateId))
              .limit(1);

            if (template) {
              quizItem = {
                id: template.id,
                kind: "quiz",
                title: `Quiz: ${activeStep.conceptName}`,
                href: `/courses/${courseId}/quiz/${template.id}`,
              };
              quizPicked = true;
            }
          }

          // Module recommendation from path
          if (!modulePicked && activeStep.actions.moduleHref) {
            const materialId = activeStep.actions.moduleHref.split("/").pop();
            if (materialId) {
              const [material] = await db
                .select({ id: websiteMaterials.id, title: websiteMaterials.title })
                .from(websiteMaterials)
                .where(eq(websiteMaterials.id, materialId))
                .limit(1);

              if (material) {
                moduleItem = {
                  id: material.id,
                  kind: "module",
                  title: material.title,
                  href: `/courses/${courseId}/material/${material.id}`,
                };
                modulePicked = true;
              }
            }
          }
        }
      } catch (err) {
        console.error(`Error computing recommendations from study path for course ${courseId}:`, err);
      }
  }

  // Fallback to legacy quiz selection if not picked by study path
  if (!quizPicked) {
    const passedRows = await db
      .select({ templateId: studentQuizAttempts.templateId })
      .from(studentQuizAttempts)
      .where(
        and(
          eq(studentQuizAttempts.studentId, studentId),
          eq(studentQuizAttempts.status, "completed"),
          gte(studentQuizAttempts.score, 70)
        )
      );
    const passedIds = passedRows.map((r) => r.templateId);

    const quizQuery = db
      .select({
        id: quizTemplates.id,
        title: quizTemplates.title,
        courseId: quizTemplates.courseId,
      })
      .from(quizTemplates)
      .innerJoin(
        enrollments,
        and(
          eq(quizTemplates.courseId, enrollments.courseId),
          eq(enrollments.userId, studentId),
          gt(enrollments.expiresAt, now)
        )
      )
      .where(passedIds.length > 0 ? notInArray(quizTemplates.id, passedIds) : undefined)
      .limit(1);

    const [quiz] = await quizQuery;

    if (quiz) {
      let conceptLabel = "";
      try {
        const mastery = await getMastery(studentId, quiz.courseId);
        if (mastery.length > 0) conceptLabel = mastery[0].conceptName;
      } catch {
        // mastery not available yet
      }

      quizItem = {
        id: quiz.id,
        kind: "quiz",
        title: conceptLabel ? `Quiz: ${conceptLabel}` : quiz.title,
        href: `/courses/${quiz.courseId}/quiz/${quiz.id}`,
      };
    }
  }

  // Fallback to legacy module selection if not picked by study path
  if (!modulePicked) {
    const completedChapIds = await db
      .select({ chapterId: studentChapterProgress.chapterId })
      .from(studentChapterProgress)
      .where(
        and(
          eq(studentChapterProgress.studentId, studentId),
          eq(studentChapterProgress.completed, true)
        )
      );
    const completedIds = completedChapIds.map((r) => r.chapterId);

    const moduleQuery = db
      .select({
        id: websiteMaterials.id,
        title: websiteMaterials.title,
        courseId: websiteMaterials.courseId,
        chapterId: websiteMaterials.chapterId,
      })
      .from(websiteMaterials)
      .innerJoin(chapters, eq(websiteMaterials.chapterId, chapters.id))
      .innerJoin(
        enrollments,
        and(
          eq(websiteMaterials.courseId, enrollments.courseId),
          eq(enrollments.userId, studentId),
          gt(enrollments.expiresAt, now)
        )
      )
      .where(
        and(
          eq(websiteMaterials.status, "published"),
          eq(chapters.status, "published"),
          completedIds.length > 0
            ? notInArray(websiteMaterials.chapterId, completedIds)
            : undefined
        )
      )
      .orderBy(asc(chapters.orderIndex))
      .limit(1);

    const [module] = await moduleQuery;

    if (module) {
      moduleItem = {
        id: module.id,
        kind: "module",
        title: module.title,
        href: `/courses/${module.courseId}/material/${module.id}`,
      };
    }
  }

  if (quizItem) {
    items.push(quizItem);
  }
  if (moduleItem) {
    items.push(moduleItem);
  }

  return items;
}

export interface RecommendationResponse {
  items: Array<PlanItem & { done: boolean }>;
}

export async function getOrBuildTodayRecommendation(
  studentId: string,
  enrolledCourseIds: string[]
): Promise<RecommendationResponse> {
  const today = todayUtc();

  const [existing] = await db
    .select()
    .from(dailyRecommendations)
    .where(
      and(
        eq(dailyRecommendations.studentId, studentId),
        eq(dailyRecommendations.date, today)
      )
    )
    .limit(1);

  if (existing) {
    const payload = existing.payload as Payload;
    const completed = (existing.completedItems as string[]) ?? [];
    return {
      items: payload.items.map((item) => ({ ...item, done: completed.includes(item.id) })),
    };
  }

  // Build fresh plan
  const planItems = await buildPlan(studentId, enrolledCourseIds);
  const payload: Payload = { items: planItems };

  try {
    await db.insert(dailyRecommendations).values({
      id: randomUUID(),
      studentId,
      date: today,
      payload,
      completedItems: [],
      generatedAt: new Date(),
    });
  } catch {
    console.error("[recommendations] Daily cache persistence failed");
  }

  return {
    items: planItems.map((item) => ({ ...item, done: false })),
  };
}

export async function markRecommendationDone(
  itemId: string,
  studentId: string
): Promise<void> {
  const today = todayUtc();

  const [rec] = await db
    .select({ id: dailyRecommendations.id, completedItems: dailyRecommendations.completedItems })
    .from(dailyRecommendations)
    .where(
      and(
        eq(dailyRecommendations.studentId, studentId),
        eq(dailyRecommendations.date, today)
      )
    )
    .limit(1);

  if (!rec) return;

  const completed = (rec.completedItems as string[]) ?? [];
  if (completed.includes(itemId)) return;

  await db
    .update(dailyRecommendations)
    .set({ completedItems: [...completed, itemId] })
    .where(eq(dailyRecommendations.id, rec.id));
}

export async function buildPlanForConcepts(
  studentId: string,
  courseId: string,
  conceptNames: string[]
): Promise<PlanItem[]> {
  if (conceptNames.length === 0) return [];

  const now = new Date();
  const items: PlanItem[] = [];

  // 1. Flashcards covering these concepts
  const dueRows = await db
    .selectDistinct({ cardId: flashcards.id, courseId: flashcardSets.courseId })
    .from(flashcards)
    .innerJoin(flashcardSets, eq(flashcards.setId, flashcardSets.id))
    .innerJoin(knowledgeObjects, eq(flashcards.koId, knowledgeObjects.id))
    .leftJoin(
      studentFlashcardProgress,
      and(
        eq(studentFlashcardProgress.flashcardId, flashcards.id),
        eq(studentFlashcardProgress.studentId, studentId)
      )
    )
    .where(
      and(
        eq(flashcards.status, "active"),
        eq(flashcardSets.status, "published"),
        eq(flashcardSets.courseId, courseId),
        inArray(knowledgeObjects.conceptName, conceptNames),
        or(
          isNull(studentFlashcardProgress.id),
          lte(studentFlashcardProgress.dueDate, now)
        )
      )
    )
    .limit(20);

  if (dueRows.length > 0) {
    items.push({
      id: "flashcards",
      kind: "flashcards",
      title: `Review flashcards (${conceptNames.slice(0, 2).join(", ")}${conceptNames.length > 2 ? "..." : ""})`,
      count: dueRows.length,
      href: `/courses/${courseId}/flashcard`,
    });
  }

  // 2. Quiz: unpassed published template covering these concepts
  const passedRows = await db
    .select({ templateId: studentQuizAttempts.templateId })
    .from(studentQuizAttempts)
    .where(
      and(
        eq(studentQuizAttempts.studentId, studentId),
        eq(studentQuizAttempts.status, "completed"),
        gte(studentQuizAttempts.score, 70)
      )
    );
  const passedIds = passedRows.map((r) => r.templateId);

  const quizTemplatesRows = await db
    .select({
      id: quizTemplates.id,
      title: quizTemplates.title,
      selectionRules: quizTemplates.selectionRules,
    })
    .from(quizTemplates)
    .where(
      and(
        eq(quizTemplates.courseId, courseId),
        passedIds.length > 0 ? notInArray(quizTemplates.id, passedIds) : undefined
      )
    );

  const matchedQuiz = quizTemplatesRows.find((q) => {
    const rules = q.selectionRules as Record<string, unknown> | null;
    const tags = rules?.tags as string[] | undefined;
    return tags && tags.some((t) => conceptNames.includes(t));
  });

  if (matchedQuiz) {
    items.push({
      id: matchedQuiz.id,
      kind: "quiz",
      title: `Practice: ${matchedQuiz.title}`,
      href: `/courses/${courseId}/quiz/${matchedQuiz.id}`,
    });
  }

  // 3. Module: first uncompleted published chapter material covering these concepts
  const completedChapIds = await db
    .select({ chapterId: studentChapterProgress.chapterId })
    .from(studentChapterProgress)
    .where(
      and(
        eq(studentChapterProgress.studentId, studentId),
        eq(studentChapterProgress.completed, true)
      )
    );
  const completedIds = completedChapIds.map((r) => r.chapterId);

  const moduleQuery = await db
    .select({
      id: websiteMaterials.id,
      title: websiteMaterials.title,
      chapterId: websiteMaterials.chapterId,
    })
    .from(websiteMaterials)
    .innerJoin(chapters, eq(websiteMaterials.chapterId, chapters.id))
    .innerJoin(knowledgeObjects, eq(knowledgeObjects.chapterId, chapters.id))
    .where(
      and(
        eq(websiteMaterials.courseId, courseId),
        eq(websiteMaterials.status, "published"),
        eq(chapters.status, "published"),
        inArray(knowledgeObjects.conceptName, conceptNames),
        completedIds.length > 0 ? notInArray(websiteMaterials.chapterId, completedIds) : undefined
      )
    )
    .orderBy(asc(chapters.orderIndex))
    .limit(1);

  const matchedModule = moduleQuery[0];

  if (matchedModule) {
    items.push({
      id: matchedModule.id,
      kind: "module",
      title: `Review: ${matchedModule.title}`,
      href: `/courses/${courseId}/material/${matchedModule.id}`,
    });
  }

  return items.slice(0, 3);
}
