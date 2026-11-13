import { and, asc, eq, lte, lt, or, isNull } from "drizzle-orm";
import { db } from "@/db";
import { flashcard, setFlashcard, flashcardIde, rekomendasiFlashcard, kemajuanFlashcardMurid, pemahamanIde } from "@/db/schema";
import { canAccessCourseContent, resolveCourseAccessBatch } from "@/lib/student/course-access";

export const FLASHCARD_SUPPRESSION_MASTERY_SCORE = 80;

export type IdeaRecommendationCandidate = {
  flashcardId: string;
  ideaId: string;
  dueAt: Date;
  masteryScore: number;
  confidence: number;
};

export type IdeaRecommendation = IdeaRecommendationCandidate & {
  priority: number;
  reason: string;
};

function reasonFor(candidate: IdeaRecommendationCandidate, now: Date): string {
  const reasons: string[] = [];
  if (candidate.masteryScore < 40) reasons.push("low_mastery");
  if (candidate.confidence < 50) reasons.push("low_confidence");
  if (candidate.dueAt.getTime() <= now.getTime()) reasons.push("due_review");
  return reasons.join("+") || "maintenance_review";
}

export function rankIdeaRecommendations(
  candidates: readonly IdeaRecommendationCandidate[],
  now: Date = new Date(),
): IdeaRecommendation[] {
  return candidates
    .filter((candidate) => candidate.masteryScore < FLASHCARD_SUPPRESSION_MASTERY_SCORE)
    .map((candidate) => {
      const dueUrgency = candidate.dueAt.getTime() <= now.getTime() ? 30 : 0;
      const priority = Math.max(0, 100 - candidate.masteryScore) + Math.max(0, 70 - candidate.confidence) * 0.4 + dueUrgency;
      return { ...candidate, priority: Number(priority.toFixed(4)), reason: reasonFor(candidate, now) };
    })
    .sort((left, right) => {
      const priorityDelta = right.priority - left.priority;
      if (priorityDelta !== 0) return priorityDelta;
      const dueDelta = left.dueAt.getTime() - right.dueAt.getTime();
      return dueDelta === 0 ? left.flashcardId.localeCompare(right.flashcardId) : dueDelta;
    });
}

export async function writeIdeaRecommendations(
  penggunaId: string,
  candidates: readonly IdeaRecommendationCandidate[],
  limit = 20,
): Promise<IdeaRecommendation[]> {
  const recommendations = rankIdeaRecommendations(candidates).slice(0, limit);
  for (const recommendation of recommendations) {
    await db
      .insert(rekomendasiFlashcard)
      .values({
        id: `recommendation-${penggunaId}-${recommendation.flashcardId}-${recommendation.dueAt.getTime()}`,
        penggunaId,
        flashcardId: recommendation.flashcardId,
        ideId: recommendation.ideaId,
        dueAt: recommendation.dueAt,
        reason: recommendation.reason,
        status: "pending",
      })
      .onConflictDoNothing();
  }
  return recommendations;
}

export async function refreshIdeaRecommendations(penggunaId: string, limit = 20): Promise<IdeaRecommendation[]> {
  const now = new Date();
  const rows = await db
    .select({
      flashcardId: flashcardIde.flashcardId,
      ideaId: flashcardIde.ideId,
      dueAt: kemajuanFlashcardMurid.dueAt,
      courseId: setFlashcard.mataKuliahId,
      chapterId: setFlashcard.babId,
      masteryScore: pemahamanIde.skor,
      confidence: pemahamanIde.keyakinan,
    })
    .from(flashcardIde)
    .innerJoin(flashcard, eq(flashcardIde.flashcardId, flashcard.id))
    .innerJoin(setFlashcard, eq(flashcard.setFlashcardId, setFlashcard.id))
    .innerJoin(pemahamanIde, and(eq(pemahamanIde.ideId, flashcardIde.ideId), eq(pemahamanIde.penggunaId, penggunaId)))
    .leftJoin(
      kemajuanFlashcardMurid,
      and(eq(kemajuanFlashcardMurid.flashcardId, flashcardIde.flashcardId), eq(kemajuanFlashcardMurid.penggunaId, penggunaId)),
    )
    .where(
      and(
        eq(flashcard.status, "published"),
        eq(setFlashcard.status, "published"),
        lt(pemahamanIde.skor, FLASHCARD_SUPPRESSION_MASTERY_SCORE),
        or(isNull(kemajuanFlashcardMurid.id), and(eq(kemajuanFlashcardMurid.status, "active"), lte(kemajuanFlashcardMurid.dueAt, now))),
      ),
    )
    .orderBy(asc(kemajuanFlashcardMurid.dueAt), asc(flashcardIde.flashcardId));

  const access = await resolveCourseAccessBatch(penggunaId, rows.map((row) => row.courseId), { now });

  return writeIdeaRecommendations(
    penggunaId,
    rows.filter((row) => {
      const policy = access.get(row.courseId);
      return policy && canAccessCourseContent(policy, "flashcard", [row.chapterId]);
    }).map((row) => ({
      flashcardId: row.flashcardId,
      ideaId: row.ideaId,
      dueAt: row.dueAt ?? now,
      masteryScore: row.masteryScore,
      confidence: row.confidence,
    })),
    limit,
  );
}
