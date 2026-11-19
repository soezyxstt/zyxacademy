import { z } from "zod";
import type { FlashcardSessionState } from "@/lib/demo/flashcard-resume";

export const flashcardReviewInputSchema = z.object({
  studentId: z.string().min(1),
  courseId: z.string().min(1),
  flashcardId: z.string().min(1),
  grade: z.number().int().min(1).max(4),
  manualAnswer: z.string().optional(),
  isExamMode: z.boolean(),
});

export const flashcardReviewResultSchema = z.object({
  nextReviewDue: z.date(),
  nextIntervalDays: z.number().nonnegative(),
  nextBox: z.number().int().nonnegative(),
  examInputPassed: z.boolean().optional(),
});

export type FlashcardReviewInput = z.infer<typeof flashcardReviewInputSchema>;
export type FlashcardReviewResult = z.infer<typeof flashcardReviewResultSchema>;

export interface FlashcardQueueItem {
  card: {
    id: string;
    setId: string;
    koId: string | null;
    front: string;
    back: string;
    explanation: string | null;
    status: string;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
  };
  progress: unknown;
  dueStatus: "new" | "review";
  nextReviewDue: Date;
  ideaId: string | null;
  masteryScore: number | null;
  confidence: number | null;
  seenBefore: boolean;
  priorityReason: string;
}

export type FlashcardSessionProps = {
  courseId: string;
  initialQueue: FlashcardQueueItem[];
  studentId: string;
  adapter?: {
    onReview: (cardId: string, grade: number) => void | Promise<void>;
    backHref: string;
    onRestart?: () => void;
    resume?: FlashcardSessionState | null;
    onStateChange?: (state: FlashcardSessionState) => void;
  };
};
