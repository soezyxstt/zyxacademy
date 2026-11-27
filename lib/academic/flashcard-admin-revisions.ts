import { revisionOf } from "@/lib/admin-mcp/revision";

type Card = { id: string; front: string; back: string; explanation: string | null; status: string; updatedAt: Date };
type Set = { id: string; title: string; chapterId: string | null; status: string; updatedAt: Date };

export function legacyFlashcardStatus(value: string) {
  return value === "active" ? "published" as const : "draft" as const;
}

export function legacyFlashcardSetStatus(value: string) {
  return value === "published" ? "published" as const : "draft" as const;
}

export function flashcardRevision({ id, front, back, explanation, status, updatedAt }: Card) {
  return revisionOf({ id, front, back, explanation, status, updatedAt });
}

export function flashcardSetRevision({ id, title, chapterId, status, updatedAt }: Set, cards?: Card[]) {
  return revisionOf({ id, title, chapterId, status, updatedAt, cards: cards?.map(flashcardRevision).sort() });
}
