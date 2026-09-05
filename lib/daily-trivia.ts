import { jakartaDay } from "@/lib/date-utils";

export type DailyTrivia = { id: string; question: string; options: string[]; correctIndex: number; explanation: string };
export type DailyTriviaCandidate = {
  id: string;
  prompt: string;
  options: unknown;
  correctIndices: unknown;
  explanation: string | null;
  questionType: string;
  tags: unknown;
  status: string;
  reviewStatus: string;
  isStale: boolean;
  knowledgeObjectId: string | null;
};

function stringArray(value: unknown): string[] | null {
  let parsed = value;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); } catch { return null; }
  }
  return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed.map((item) => item.trim()) : null;
}

function numberArray(value: unknown): number[] | null {
  let parsed = value;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); } catch { return null; }
  }
  return Array.isArray(parsed) && parsed.every((item) => Number.isInteger(item)) ? parsed as number[] : null;
}

export function validateDailyTriviaCandidate(candidate: DailyTriviaCandidate, hasCanonicalIdeaAnchor: boolean): DailyTrivia | null {
  const tags = stringArray(candidate.tags)?.map((tag) => tag.toLocaleLowerCase("id")) ?? [];
  if (!tags.includes("trivia") || tags.some((tag) => ["survey", "feedback", "form", "registration"].includes(tag))) return null;
  if (candidate.status !== "active" || candidate.reviewStatus !== "published" || candidate.isStale || candidate.questionType !== "multiple_choice") return null;
  if (!candidate.knowledgeObjectId && !hasCanonicalIdeaAnchor) return null;
  const options = stringArray(candidate.options);
  const correctIndices = numberArray(candidate.correctIndices);
  if (!options || options.length < 2 || options.length > 6 || options.some((option) => !option)) return null;
  if (new Set(options.map((option) => option.toLocaleLowerCase("id"))).size !== options.length) return null;
  if (!correctIndices || correctIndices.length !== 1 || correctIndices[0]! < 0 || correctIndices[0]! >= options.length) return null;
  if (!candidate.prompt.trim() || !candidate.explanation?.trim()) return null;
  return { id: candidate.id, question: candidate.prompt.trim(), options, correctIndex: correctIndices[0]!, explanation: candidate.explanation.trim() };
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}

export function selectDailyTrivia(candidates: readonly DailyTrivia[], courseId: string, date: Date = new Date()): DailyTrivia | null {
  if (candidates.length === 0) return null;
  const ordered = [...candidates].sort((left, right) => left.id.localeCompare(right.id));
  return ordered[stableHash(`${courseId}:${jakartaDay(date)}`) % ordered.length] ?? null;
}
