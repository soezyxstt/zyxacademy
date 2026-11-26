import type { QuestionIdeaLink } from "../../../lib/question-authoring-contract";

export function rebalanceIdeaLinks(current: readonly QuestionIdeaLink[], ideaId: string, checked: boolean): QuestionIdeaLink[] {
  const existing = new Map(current.map((link) => [link.ideaId, link]));
  if (checked) existing.set(ideaId, { ideaId, weight: 1, role: current.length === 0 ? "primary" : "supporting" });
  else existing.delete(ideaId);
  return [...existing.values()].map((link, index) => ({
    ...link,
    weight: 1 / existing.size,
    role: link.role ?? (index === 0 ? "primary" : "supporting"),
  }));
}

export function ideaWeightTotal(links: readonly QuestionIdeaLink[]) {
  return links.reduce((sum, link) => sum + link.weight, 0);
}

export function hasValidIdeaWeights(links: readonly QuestionIdeaLink[]) {
  return links.length === 0 || Math.abs(ideaWeightTotal(links) - 1) <= 0.000001;
}

export function isValidIdeaWeight(weight: number) {
  return Number.isFinite(weight) && weight > 0 && weight <= 1;
}

export function parseIdeaWeightInput(value: string) {
  const text = value.trim();
  if (!/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(text)) return 0;
  const weight = Number(text.replace(",", "."));
  return Number.isFinite(weight) ? weight : 0;
}
