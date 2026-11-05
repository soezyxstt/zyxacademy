import type { QueueItem } from "@/app/(student)/courses/[id]/flashcard/flashcard-client";
import type { DemoFlashcard } from "@/app/(marketing)/demo/demo-data";

/** The demo queue is synthetic and never carries student or set identifiers. */
export function demoFlashcardQueue(cards: readonly DemoFlashcard[]): QueueItem[] {
  return cards.map((card, index) => ({
    card: { id: `demo-flashcard-${index}`, setId: "demo-set", koId: null, front: card.front, back: card.back, explanation: card.explanation, status: "published", metadata: null, createdAt: new Date(0) },
    progress: null, dueStatus: "new", nextReviewDue: new Date(0), ideaId: null,
    masteryScore: null, confidence: null, seenBefore: false, priorityReason: "Kartu baru",
  }));
}
