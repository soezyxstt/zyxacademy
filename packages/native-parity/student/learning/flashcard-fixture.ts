import type { Flashcard } from "./contracts";

export const flashcardEvidence = {
  scenario: "flashcard-parity",
  courseId: "matematika-1",
  courseTitle: "Kalkulus Dasar",
  rejectionStatus: 422,
  rejection: { error: "Review rejected" },
  grade: 3,
  locale: "id",
  theme: "light",
} as const;

const first: Flashcard = {
  id: "card-1", front: "Kapan lim x → a f(x) ada?", back: "Ketika limit dari kiri dan kanan sama.",
  explanation: "Nilai fungsi di a dapat berbeda dari limitnya.", dueStatus: "new", priorityReason: "Kartu baru", recallDifficulty: 2,
};

export const flashcardEvidenceCards: readonly Flashcard[] = [
  first,
  { ...first, id: "card-2", front: "Apa makna limit dari kiri?", back: "Nilai yang didekati dari masukan yang lebih kecil." },
];
