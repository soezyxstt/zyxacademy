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
