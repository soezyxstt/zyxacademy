import { getLearningContext } from "@/lib/learning-context";

export interface PopoverKO {
  title: string;
  content: string;
}

export interface ConceptPopoverData {
  conceptName: string;
  mastery: { score: number; trend: "improving" | "stable" | "declining" | null };
  quickExplain: PopoverKO | null;
  analogy: string | null;
  example: PopoverKO | null;
  commonMistake: PopoverKO | null;
  reviewHref: string;
}

export async function loadConceptPopover(studentId: string, courseId: string, conceptName: string): Promise<ConceptPopoverData | null> {
  const ctx = await getLearningContext(studentId, courseId, { conceptName });
  if (!ctx.conceptName) return null;

  const def = ctx.kos.definition[0] ?? null;
  const example = ctx.kos.example[0] ?? null;
  const misc = ctx.kos.misconception[0] ?? null;
  return {
    conceptName: ctx.conceptName,
    mastery: { score: ctx.mastery.score, trend: ctx.mastery.trend },
    quickExplain: def ? { title: def.title, content: def.content } : null,
    analogy: ctx.kos.definition.find(entry => entry.analogy)?.analogy ?? null,
    example: example ? { title: example.title, content: example.content } : null,
    commonMistake: misc ? { title: misc.title, content: misc.content } : null,
    reviewHref: ctx.reviewHref,
  };
}
