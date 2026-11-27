export function planLocalStudyDays<T extends { estimatedMinutes: number }>(steps: T[], days: number) {
  if (!Number.isInteger(days) || days < 1 || days > 60) return null;
  return Array.from({ length: Math.min(days, steps.length) }, (_, index) => {
    const daily = steps.filter((_, stepIndex) => stepIndex % days === index);
    return { day: index + 1, steps: daily, totalMinutes: daily.reduce((total, step) => total + step.estimatedMinutes, 0) };
  });
}

export function createDemoPathSteps(concepts: Array<{ title: string; masteryPercent: number }>, chapterTitle: string) {
  return concepts.map((concept, index) => ({
    stepId: `fictional-step-${index}`,
    chapterTitle,
    conceptName: concept.title,
    status: index === 0 ? "in_progress" as const : "available" as const,
    estimatedMinutes: 12,
    masteryScore: concept.masteryPercent,
  }));
}
