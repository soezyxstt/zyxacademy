export const VECTOR_NAMESPACES = {
  learning: "learning",
  practice: "practice",
  past_exams: "past_exams",
} as const;

export const CANONICAL_NAMESPACE_BY_LEGACY = {
  learning: "canonical_ideas",
  practice: "published_questions",
  past_exams: "itb_question_references",
} as const;

export const CANONICAL_NAMESPACES = [
  "canonical_ideas",
  "published_articles",
  "source_materials",
  "itb_question_references",
  "published_questions",
  "published_solutions",
] as const;
