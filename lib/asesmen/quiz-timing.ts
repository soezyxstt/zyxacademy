type QuizTimingConfig = {
  timeLimitSeconds: number | null | undefined;
  count: number;
  fixedQuestionIds?: string[];
  perQuestionTimerEnabled?: boolean;
  perQuestionTimers?: Record<string, number>;
  defaultQuestionTimerSeconds?: number;
};

export function getQuizTimingMismatch(config: QuizTimingConfig): string | null {
  if (!config.perQuestionTimerEnabled || config.timeLimitSeconds == null) return null;

  const fallbackSeconds = config.defaultQuestionTimerSeconds ?? 60;
  const plannedTotalSeconds =
    config.fixedQuestionIds && config.fixedQuestionIds.length > 0
      ? config.fixedQuestionIds.reduce(
          (sum, questionId) => sum + (config.perQuestionTimers?.[questionId] ?? fallbackSeconds),
          0,
        )
      : fallbackSeconds * Math.max(1, config.count);

  if (plannedTotalSeconds === config.timeLimitSeconds) return null;

  return `Total timer per soal (${plannedTotalSeconds} detik) tidak sama dengan batas waktu keseluruhan (${config.timeLimitSeconds} detik). Samakan keduanya sebelum menyimpan.`;
}
