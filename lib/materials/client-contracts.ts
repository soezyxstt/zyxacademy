import { z } from "zod";

export const materialProgressInputSchema = z.object({
  materialId: z.string().min(1),
  completionPercent: z.number().min(0).max(100),
  lastSectionId: z.string().nullable().optional(),
  lastPosition: z.object({
    type: z.enum(["pdf", "article"]),
    page: z.number().int().positive().optional(),
    section: z.string().optional(),
  }).nullable().optional(),
  timeSpentSeconds: z.number().int().nonnegative(),
});

export const materialProgressResultSchema = materialProgressInputSchema.extend({
  studentId: z.string().min(1),
});
export const materialStatusResultSchema = z.object({ success: z.literal(true) });

export const chapterSummaryResultSchema = z.object({
  summary: z.object({
    keyConcepts: z.array(z.string()),
    commonMistakes: z.array(z.string()),
    importantFormulas: z.array(z.string()),
    practiceRecommendations: z.array(z.string()),
  }),
  cached: z.boolean(),
  budgetExhausted: z.boolean(),
});
export type ChapterSummary = z.infer<typeof chapterSummaryResultSchema>["summary"];
export type MaterialProgressInput = z.infer<typeof materialProgressInputSchema>;

type ReadingPosition = {
  kind: string;
  done: boolean;
  sectionCount: number;
  sectionIndex: number;
  sectionTitle?: string;
  page: number;
};

/** Real PDF pages live in an iframe. Only an explicit completion marks them done. */
export function materialReadingPosition(position: ReadingPosition) {
  if (position.kind === "article" && position.sectionCount > 0) {
    return {
      completionPercent: Math.min(100, Math.round(((position.sectionIndex + 1) / position.sectionCount) * 100)),
      lastSectionId: position.sectionTitle || `Section ${position.sectionIndex}`,
      lastPosition: { type: "article" as const, section: position.sectionIndex.toString() },
    };
  }
  return {
    completionPercent: position.done ? 100 : 0,
    lastSectionId: `Halaman ${position.page}`,
    lastPosition: { type: "pdf" as const, page: position.page },
  };
}

type PositionSnapshot = ReturnType<typeof materialReadingPosition>;

export function createMaterialProgressTracker() {
  let elapsedSeconds = 0;
  let submitted: PositionSnapshot | null = null;
  return {
    tick() { elapsedSeconds += 1; },
    invalidatePosition() { submitted = null; },
    take(materialId: string, position: PositionSnapshot, force: boolean): MaterialProgressInput | null {
      if (!elapsedSeconds) return null;
      const changed = !submitted
        || Math.abs(position.completionPercent - submitted.completionPercent) >= 5
        || position.lastPosition.type !== submitted.lastPosition.type
        || ("section" in position.lastPosition && position.lastPosition.section !== ("section" in submitted.lastPosition ? submitted.lastPosition.section : undefined))
        || ("page" in position.lastPosition && position.lastPosition.page !== ("page" in submitted.lastPosition ? submitted.lastPosition.page : undefined));
      if (!force && !changed) return null;
      const timeSpentSeconds = elapsedSeconds;
      elapsedSeconds = 0;
      submitted = position;
      return { materialId, ...position, timeSpentSeconds };
    },
  };
}
