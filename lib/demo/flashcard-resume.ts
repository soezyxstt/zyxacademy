import { z } from "zod";

export const FLASHCARD_BATCH_SIZE = 10;
export const DEMO_FLASHCARD_RESUME_PREFIX = "zyx-demo-flashcards:1:";
const resumeSchema = z.object({
  version: z.literal(1),
  identity: z.string().max(20000),
  queue: z.array(z.object({ id: z.string().max(128), dueStatus: z.enum(["new", "review"]) }).strict()).max(5000),
  batchOffset: z.number().int().nonnegative(),
  currentIndex: z.number().int().min(0).max(FLASHCARD_BATCH_SIZE),
  isFlipped: z.boolean(),
  mode: z.enum(["standard", "exam"]),
  typedAnswer: z.string().max(20000),
  isChecked: z.boolean(),
  passedExam: z.boolean().nullable(),
  completedCount: z.number().int().min(0).max(5000),
}).strict();
export type FlashcardResume = z.infer<typeof resumeSchema>;
export type FlashcardSessionState = Omit<FlashcardResume, "version" | "identity">;
export const demoFlashcardResumeKey = (identity: string) => `${DEMO_FLASHCARD_RESUME_PREFIX}${encodeURIComponent(identity)}`;

/** Resolve only known card IDs against the current server queue, never saved content. */
export function parseFlashcardResume(raw: string | null, identity: string, cardIds: readonly string[]): FlashcardResume | null {
  try {
    if (!raw || raw.length > 800000) return null;
    const parsed = resumeSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const value = parsed.data;
    const known = new Set(cardIds);
    const saved = new Set(value.queue.map(item => item.id));
    const batchLength = Math.min(FLASHCARD_BATCH_SIZE, value.queue.length - value.batchOffset);
    if (value.identity !== identity || saved.size !== known.size || [...saved].some(id => !known.has(id))
      || value.queue.length < cardIds.length || value.queue.length > cardIds.length + value.completedCount
      || value.batchOffset % FLASHCARD_BATCH_SIZE !== 0 || batchLength < 0 || value.currentIndex > batchLength
      || value.completedCount !== value.batchOffset + value.currentIndex
      || (value.isChecked && (value.mode !== "exam" || !value.typedAnswer.trim() || value.passedExam === null))
      || (!value.isChecked && value.passedExam !== null)
      || (value.mode === "exam" && value.isFlipped && !value.isChecked)) return null;
    return value;
  } catch { return null; }
}

