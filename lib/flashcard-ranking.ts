export type FlashcardQueuePriorityInput = {
  cardId: string;
  ideaId: string | null;
  masteryScore: number | null;
  confidence: number | null;
  seenBefore: boolean;
  nextReviewDue: Date;
};

export function rankFlashcardQueue<T extends FlashcardQueuePriorityInput>(items: readonly T[]): T[] {
  return [...items]
    .filter((item) => item.masteryScore === null || item.masteryScore < 80)
    .sort((left, right) => {
      const mappedDelta = Number(right.ideaId !== null) - Number(left.ideaId !== null);
      if (mappedDelta !== 0) return mappedDelta;
      const masteryDelta = (left.masteryScore ?? 0) - (right.masteryScore ?? 0);
      if (masteryDelta !== 0) return masteryDelta;
      const seenDelta = Number(left.seenBefore) - Number(right.seenBefore);
      if (seenDelta !== 0) return seenDelta;
      const dueDelta = left.nextReviewDue.getTime() - right.nextReviewDue.getTime();
      return dueDelta !== 0 ? dueDelta : left.cardId.localeCompare(right.cardId);
    });
}

export function isReviewDue(progress: { due: Date; status?: string } | null | undefined, now: number): boolean {
  return !progress || ((progress.status === undefined || progress.status === "active") && progress.due.getTime() <= now);
}

export function weakestFlashcardIdea<T extends { ideaId: string; masteryScore: number | null }>(rows: readonly T[]): T | undefined {
  return rows.reduce<T | undefined>((current, row) => !current || (row.masteryScore ?? 0) < (current.masteryScore ?? 0) || ((row.masteryScore ?? 0) === (current.masteryScore ?? 0) && row.ideaId.localeCompare(current.ideaId) < 0) ? row : current, undefined);
}
