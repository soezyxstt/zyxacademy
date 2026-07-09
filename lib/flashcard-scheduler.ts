export interface SM2ProgressInput {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  lastReviewedAt: Date | null;
}

export interface SM2ProgressOutput {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  dueDate: Date;
}

export interface SM2Result {
  nextBox: number;
  nextEF: number;
  nextIntervalDays: number;
  nextReviewDue: Date;
  safetyFloorActive: boolean;
}

export function difficultyFirstInterval(recallDifficulty: number): number {
  const d = Math.max(1, Math.min(5, Math.round(recallDifficulty)));
  return Math.max(1, Math.min(3, 4 - d));
}

/**
 * Calculates next spacing interval, Ease Factor, and due dates using SM-2.
 */
export function calculateSM2(
  previous: SM2ProgressInput,
  grade: number // 1 = Again, 2 = Hard, 3 = Good, 4 = Easy
): SM2ProgressOutput {
  const now = new Date();
  let easeFactor = previous.easeFactor;
  let repetitions = previous.repetitions;
  let intervalDays = previous.intervalDays;
  let lapses = previous.lapses;

  if (grade === 1) {
    repetitions = 0;
    intervalDays = 1;
    lapses = lapses + 1;
    easeFactor = Math.max(1.3, easeFactor - 0.2);
  } else {
    repetitions = repetitions + 1;
    
    if (grade === 2) {
      easeFactor = Math.max(1.3, easeFactor - 0.15);
    } else if (grade === 4) {
      easeFactor = easeFactor + 0.15;
    }

    if (repetitions === 1) {
      intervalDays = grade === 4 ? 2 : 1;
    } else if (repetitions === 2) {
      intervalDays = grade === 4 ? 8 : grade === 3 ? 6 : 3;
    } else {
      let multiplier = easeFactor;
      if (grade === 2) {
        multiplier = 1.2; // small interval increase
      } else if (grade === 4) {
        multiplier = easeFactor * 1.3; // accelerated progression
      }
      intervalDays = Math.max(1, Math.round(previous.intervalDays * multiplier));
    }
  }

  easeFactor = Math.max(1.3, parseFloat(easeFactor.toFixed(2)));

  const dueDate = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);

  return {
    easeFactor,
    intervalDays,
    repetitions,
    lapses,
    dueDate,
  };
}

/**
 * Wrapper for backward compatibility.
 */
export function calculateNextReview(
  grade: number,
  currentBox: number,
  currentEF: number,
  currentIntervalDays: number,
  lastReviewedAt: Date | null,
  _safetyFloorActive: boolean = false,
  _recallDifficulty?: number
): SM2Result {
  const output = calculateSM2(
    {
      easeFactor: currentEF,
      intervalDays: currentIntervalDays,
      repetitions: currentBox,
      lapses: 0,
      lastReviewedAt,
    },
    grade
  );

  return {
    nextBox: output.repetitions,
    nextEF: output.easeFactor,
    nextIntervalDays: output.intervalDays,
    nextReviewDue: output.dueDate,
    safetyFloorActive: false,
  };
}
