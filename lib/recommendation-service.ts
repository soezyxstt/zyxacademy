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
  artikel,
  flashcard as canonicalFlashcard,
  setFlashcard,
  flashcardIde,
  ide,
  conceptLocalizations,
  kemajuanFlashcardMurid,
} from "@/db/schema";
import { getMastery } from "@/lib/mastery-store";
import { getOrComputeStudyPath } from "@/lib/study-path-service";
import { eq, and, or, lte, isNull, gt, gte, notInArray, asc, inArray, sql } from "drizzle-orm";
import { resolveStudentCourse } from "@/lib/student/course-catalog";
import { getDueFlashcardCounts } from "@/lib/student/due-flashcards";
import { canAccessCourseContent, resolveCourseAccess } from "@/lib/student/course-access";

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
  const now = new Date();
  const items: PlanItem[] = [];

  // ── a. Flashcards: due + new, capped at 20 ─────────────────────────────────
  const dueCounts = await getDueFlashcardCounts(studentId, now);
  const firstDue = [...dueCounts].find(([, count]) => count > 0);
  if (firstDue) {
    const [courseId] = firstDue;
    items.push({
      id: "flashcards",
      kind: "flashcards",
      title: "Review flashcards",
      count: Math.min(20, [...dueCounts.values()].reduce((sum, count) => sum + count, 0)),
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
              let [material] = await db
                .select({ id: websiteMaterials.id, title: websiteMaterials.title })
                .from(websiteMaterials)
                .where(eq(websiteMaterials.id, materialId))
                .limit(1);

              if (!material) {
                const course = await resolveStudentCourse(courseId);
                if (course?.canonicalId) {
                  [material] = await db.select({ id: artikel.id, title: artikel.title })
                    .from(artikel)
                    .where(and(eq(artikel.id, materialId), eq(artikel.mataKuliahId, course.canonicalId), eq(artikel.status, "published")))
                    .limit(1);
                }
              }

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
    const dueCounts = await getDueFlashcardCounts(studentId);
    const firstDue = [...dueCounts].find(([, count]) => count > 0);
    const items = payload.items.filter((item) => item.kind !== "flashcards");
    if (firstDue) items.unshift({ id: "flashcards", kind: "flashcards", title: "Review flashcards", count: Math.min(20, [...dueCounts.values()].reduce((sum, count) => sum + count, 0)), href: `/courses/${firstDue[0]}/flashcard` });
    return {
      items: items.map((item) => ({ ...item, done: item.kind === "flashcards" ? false : completed.includes(item.id) })),
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

  await db
    .update(dailyRecommendations)
    .set({ completedItems: sql`coalesce(${dailyRecommendations.completedItems}, '[]'::jsonb) || jsonb_build_array(${itemId}::text)` })
    .where(and(
      eq(dailyRecommendations.studentId, studentId),
      eq(dailyRecommendations.date, today),
      sql`not (coalesce(${dailyRecommendations.completedItems}, '[]'::jsonb) @> jsonb_build_array(${itemId}::text))`,
    ));
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
  const access = await resolveCourseAccess({ courseId, userId: studentId, now });
  const dueRows = await db
    .selectDistinct({ cardId: flashcards.id, courseId: flashcardSets.courseId, chapterId: flashcardSets.chapterId })
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
        eq(flashcardSets.isStale, false),
        eq(flashcardSets.courseId, access.legacyCourseId ?? courseId),
        inArray(knowledgeObjects.conceptName, conceptNames),
        or(
          isNull(studentFlashcardProgress.id),
          lte(studentFlashcardProgress.dueDate, now)
        )
      )
    );

  const canonicalCards = access.canonicalCourseId ? await db.select({ id: canonicalFlashcard.id }).from(canonicalFlashcard)
    .innerJoin(setFlashcard, eq(canonicalFlashcard.setFlashcardId, setFlashcard.id))
    .where(and(eq(setFlashcard.mataKuliahId, access.canonicalCourseId), eq(setFlashcard.status, "published"), eq(canonicalFlashcard.status, "published"))).limit(1) : [];
  const canonicalDue = canonicalCards.length ? await db.selectDistinct({ cardId: canonicalFlashcard.id, chapterId: setFlashcard.babId })
    .from(canonicalFlashcard)
    .innerJoin(setFlashcard, eq(canonicalFlashcard.setFlashcardId, setFlashcard.id))
    .innerJoin(flashcardIde, eq(flashcardIde.flashcardId, canonicalFlashcard.id))
    .innerJoin(ide, eq(ide.id, flashcardIde.ideId))
    .innerJoin(conceptLocalizations, eq(conceptLocalizations.conceptId, ide.conceptId))
    .leftJoin(kemajuanFlashcardMurid, and(eq(kemajuanFlashcardMurid.flashcardId, canonicalFlashcard.id), eq(kemajuanFlashcardMurid.penggunaId, studentId)))
    .where(and(eq(setFlashcard.mataKuliahId, access.canonicalCourseId!), eq(setFlashcard.status, "published"), eq(canonicalFlashcard.status, "published"), inArray(conceptLocalizations.displayName, conceptNames), or(isNull(kemajuanFlashcardMurid.id), and(eq(kemajuanFlashcardMurid.status, "active"), lte(kemajuanFlashcardMurid.dueAt, now))))) : [];
  const eligibleRows = (canonicalCards.length ? canonicalDue : dueRows).filter((row) => canAccessCourseContent(access, "flashcard", [row.chapterId]));

  if (eligibleRows.length > 0) {
    items.push({
      id: "flashcards",
      kind: "flashcards",
      title: `Review flashcards (${conceptNames.slice(0, 2).join(", ")}${conceptNames.length > 2 ? "..." : ""})`,
      count: Math.min(20, eligibleRows.length),
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
