import { compileSafeExpression, normalizeLegacyGraphExpression } from "./expression";
import { parseCanvasSpec } from "./validator";
import type { CanvasSpec } from "./contracts";

const GRAPH_INTENT = /\b(grafik|plot|kurva|graph)\b/i;

function candidateExpressions(text: string): string[] {
  const candidates: string[] = [];
  const equationPattern = /(?:\by\b|\bf\s*\(\s*x\s*\))\s*=\s*([^$\n,;]+)/gi;
  for (const match of text.matchAll(equationPattern)) {
    if (match[0]) candidates.push(match[0]);
  }
  for (const match of text.matchAll(/\$+([^$]+)\$+/g)) {
    if (match[1] && /(?:\by\b|\bf\s*\(\s*x\s*\))\s*=/.test(match[1])) candidates.push(match[1]);
  }
  for (const match of text.matchAll(/\b(?:grafik|plot|kurva|graph)(?:\s+(?:fungsi|dari|untuk))*\s+([^$\n,;]+)/gi)) {
    if (match[1]) candidates.push(match[1]);
  }
  return candidates;
}

function recoverSafeExpression(value: string): string | null {
  let candidate = normalizeLegacyGraphExpression(value);
  while (candidate.length > 0) {
    try {
      compileSafeExpression(candidate, { variables: ["x"] });
      return candidate;
    } catch {
      const shortened = candidate.replace(/\s+\S+\s*$/, "").trim();
      if (shortened === candidate) return null;
      candidate = shortened;
    }
  }
  return null;
}

export function functionPlotFromTutorText(input: {
  learnerQuestion?: string;
  answer: string;
  evidenceText?: readonly string[];
  claimRefs: readonly string[];
}): CanvasSpec | null {
  if (!input.learnerQuestion || !GRAPH_INTENT.test(input.learnerQuestion)) return null;
  const expressions = [...new Set(
    [input.learnerQuestion, input.answer, ...(input.evidenceText ?? [])]
      .flatMap(candidateExpressions)
      .map(recoverSafeExpression)
      .filter((expression): expression is string => expression !== null),
  )].slice(0, 4);
  if (expressions.length === 0) return null;

  return parseCanvasSpec({
    version: "zyra-learning-canvas-v1",
    type: "function_plot",
    title: "Grafik fungsi",
    purpose: "Menampilkan bentuk fungsi yang dibahas agar perubahan nilai lebih mudah diamati.",
    variables: [],
    controls: [],
    claimRefs: [...input.claimRefs].slice(0, 12),
    altText: `Grafik ${expressions.join(" dan ")} pada bidang koordinat.`,
    domain: { min: -10, max: 10, sampleCount: 240 },
    series: expressions.map((expression, index) => ({
      id: `f_${index + 1}`,
      label: `f${index + 1}(x)`,
      expression,
    })),
    fallback: {
      summary: "Daftar fungsi yang ditampilkan pada grafik.",
      columns: [{ id: "function", label: "Fungsi" }, { id: "expression", label: "Rumus" }],
      rows: expressions.map((expression, index) => [`f${index + 1}(x)`, expression]),
    },
  });
}
