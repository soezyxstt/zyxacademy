import { z } from "zod";

export const articleSectionProgressSchema = z.object({
  maxReadPercent: z.number().int().min(0).max(100),
  completed: z.boolean(),
  timeSpentSeconds: z.number().int().nonnegative(),
  lastReadAt: z.iso.datetime({ offset: true }).nullable().optional(),
});

export const articleProgressSchema = z.object({
  articleId: z.string().min(1),
  articleVersion: z.number().int().positive(),
  sectionProgress: z.record(z.string(), articleSectionProgressSchema),
});

export const articleProgressUpdateSchema = z.object({
  sectionId: z.string().min(1),
  articleVersion: z.number().int().positive().optional(),
  percent: z.number().min(0).max(100).default(0),
  timeSpentSeconds: z.number().min(0).default(0),
  completed: z.boolean().optional(),
});

export const articleProgressResultSchema = articleSectionProgressSchema.extend({
  success: z.literal(true),
  articleId: z.string().min(1),
  articleVersion: z.number().int().positive(),
  sectionId: z.string().min(1),
  completedAt: z.iso.datetime({ offset: true }).nullable(),
});

export type ArticleSectionProgress = z.infer<typeof articleSectionProgressSchema>;
export type ArticleProgress = z.infer<typeof articleProgressSchema>;
export type ArticleProgressUpdate = z.infer<typeof articleProgressUpdateSchema>;
export type ArticleProgressResult = z.infer<typeof articleProgressResultSchema>;

/** Server totals only increase. A late response must not undo a later receipt. */
export function mergeArticleSectionProgress(
  previous: ArticleSectionProgress | undefined,
  received: ArticleSectionProgress,
): ArticleSectionProgress {
  return {
    ...received,
    maxReadPercent: Math.max(previous?.maxReadPercent ?? 0, received.maxReadPercent),
    completed: Boolean(previous?.completed || received.completed),
    timeSpentSeconds: Math.max(previous?.timeSpentSeconds ?? 0, received.timeSpentSeconds),
  };
}

/** Each elapsed second belongs to one write, including completion followed by exit. */
export function createArticleVisit(sectionId: string) {
  let elapsedSeconds = 0;
  let maxReadPercent = 0;
  return {
    sectionId,
    tick() { elapsedSeconds += 1; },
    observe(percent: number) { maxReadPercent = Math.max(maxReadPercent, percent); },
    get elapsedSeconds() { return elapsedSeconds; },
    get maxReadPercent() { return maxReadPercent; },
    takeTime() {
      const elapsed = elapsedSeconds;
      elapsedSeconds = 0;
      return elapsed;
    },
  };
}

export type ArticleCompletionIntent = "scroll" | "explicit";

/** Failed completion writes need a user retry, not another scroll or layout event. */
export function createArticleCompletions(initialProgress: Readonly<Record<string, ArticleSectionProgress>> = {}) {
  const confirmed = new Set<string>();
  const pending = new Set<string>();
  const attempted = new Set<string>();
  const confirm = (progress: Readonly<Record<string, ArticleSectionProgress>>) => {
    for (const [id, section] of Object.entries(progress)) {
      if (section.completed || section.maxReadPercent >= 90) confirmed.add(id);
    }
  };
  confirm(initialProgress);

  return {
    confirm,
    request(sectionId: string, intent: ArticleCompletionIntent, visit: ReturnType<typeof createArticleVisit> | null): ArticleProgressUpdate | null {
      const isRetry = attempted.has(sectionId);
      if (confirmed.has(sectionId) || pending.has(sectionId) || (intent === "scroll" && isRetry)) return null;
      pending.add(sectionId);
      attempted.add(sectionId);
      const activeVisit = visit?.sectionId === sectionId ? visit : null;
      // Only the first completion may use the legacy estimate for an inactive
      // section. A retry must not replay that estimate or consumed visit time.
      const elapsed = activeVisit ? activeVisit.takeTime() : isRetry ? 0 : 5;
      activeVisit?.observe(100);
      return { sectionId, percent: 100, timeSpentSeconds: elapsed, completed: true };
    },
    settle(sectionId: string, accepted: boolean) {
      pending.delete(sectionId);
      if (accepted) confirmed.add(sectionId);
    },
  };
}
