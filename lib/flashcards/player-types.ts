import type { FlashcardSessionState } from "@/lib/demo/flashcard-resume";

interface Flashcard {
  id: string;
  setId: string;
  koId: string | null;
  front: string;
  back: string;
  explanation: string | null;
  status: string;
  metadata: any;
  createdAt: Date;
}

export interface QueueItem {
  card: Flashcard;
  progress: any;
  dueStatus: "new" | "review";
  nextReviewDue: Date;
  ideaId: string | null;
  masteryScore: number | null;
  confidence: number | null;
  seenBefore: boolean;
  priorityReason: string;
}

export type FlashcardClientProps = {
  courseId: string;
  initialQueue: QueueItem[];
  studentId: string;
  adapter?: { onReview: (cardId: string, grade: number) => void | Promise<void>; backHref: string; onRestart?: () => void; resume?: FlashcardSessionState | null; onStateChange?: (state: FlashcardSessionState) => void };
};
