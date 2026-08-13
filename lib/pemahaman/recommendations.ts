import { and, asc, eq, lte, lt, or, isNull } from "drizzle-orm";
import { db } from "@/db";
import { flashcards, flashcardIde, rekomendasiFlashcard, studentFlashcardProgress, pemahamanIde } from "@/db/schema";

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
  const rows = await db
    .select({
      flashcardId: flashcardIde.flashcardId,
      ideaId: flashcardIde.ideId,
      dueAt: studentFlashcardProgress.dueDate,
      masteryScore: pemahamanIde.skor,
      confidence: pemahamanIde.keyakinan,
    })
    .from(flashcardIde)
    .innerJoin(flashcards, eq(flashcardIde.flashcardId, flashcards.id))
    .innerJoin(pemahamanIde, and(eq(pemahamanIde.ideId, flashcardIde.ideId), eq(pemahamanIde.penggunaId, penggunaId)))
    .leftJoin(
      studentFlashcardProgress,
      and(eq(studentFlashcardProgress.flashcardId, flashcardIde.flashcardId), eq(studentFlashcardProgress.studentId, penggunaId)),
    )
    .where(
      and(
        eq(flashcards.status, "active"),
        lt(pemahamanIde.skor, FLASHCARD_SUPPRESSION_MASTERY_SCORE),
        or(isNull(studentFlashcardProgress.id), lte(studentFlashcardProgress.dueDate, new Date())),
      ),
    )
    .orderBy(asc(studentFlashcardProgress.dueDate), asc(flashcardIde.flashcardId));

  return writeIdeaRecommendations(
    penggunaId,
    rows.map((row) => ({
      flashcardId: row.flashcardId,
      ideaId: row.ideaId,
      dueAt: row.dueAt ?? new Date(),
      masteryScore: row.masteryScore,
      confidence: row.confidence,
    })),
    limit,
  );
}
