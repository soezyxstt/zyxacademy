export const landingQuizOptions = [
  { id: "a", latex: "2", text: "2", correct: false },
  { id: "b", latex: "1", text: "1", correct: true },
  { id: "c", latex: "\\tfrac{1}{2}", text: "½", correct: false },
  { id: "d", latex: "x^2", text: "x²", correct: false },
] as const;

export const landingFlashcardGrades = [
  { key: "again", delay: 0 },
  { key: "hard", delay: 3 },
  { key: "good", delay: 6 },
  { key: "easy", delay: 14 },
] as const;

type PathNode = {
  name: string;
  status: "done" | "active" | "open" | "locked";
  score?: number;
  lockedNote?: string;
};

export const landingPathProfiles: { id: "a" | "b"; labelKey: "profileA" | "profileB"; nodes: PathNode[] }[] = [
  {
    id: "a",
    labelKey: "profileA",
    nodes: [
      { name: "Limit", status: "done", score: 95 },
      { name: "Turunan", status: "done", score: 88 },
      { name: "Aturan Rantai", status: "active", score: 54 },
      { name: "Integral", status: "open", score: 31 },
      { name: "Integral Parsial", status: "locked", lockedNote: "Integral" },
      { name: "Volume Benda Putar", status: "locked", lockedNote: "Integral Parsial" },
    ],
  },
  {
    id: "b",
    labelKey: "profileB",
    nodes: [
      { name: "Limit", status: "done", score: 90 },
      { name: "Turunan", status: "done", score: 85 },
      { name: "Aturan Rantai", status: "done", score: 88 },
      { name: "Integral", status: "done", score: 76 },
      { name: "Integral Parsial", status: "active", score: 58 },
      { name: "Volume Benda Putar", status: "locked", lockedNote: "Integral Parsial" },
    ],
  },
];
