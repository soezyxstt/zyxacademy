import { compileSafeExpression, normalizeLegacyGraphExpression } from "./expression";
import { parseCanvasSpec } from "./validator";
import type { CanvasSpec } from "./contracts";

const GRAPH_INTENT = /\b(grafik|plot|kurva|graph|visualisasi|unsur visual|representasi visual|parabola|hero|desmos|kanvas)\b/i;
const QUADRATIC_INTENT = /\b(persamaan|fungsi)\s+kuadrat\b|\bkuadratik\b|\bparabola\b|\bhero\b|\bdesmos\b/i;

function candidateExpressions(text: string): string[] {
  const candidates: string[] = [];
  const equationPattern = /(?:\b[yY]\b|\b[fghFGH](?:_\d+)?\s*\(\s*[xX]\s*\))\s*[:=]\s*([^$\n,;]+)/gi;
  for (const match of text.matchAll(equationPattern)) {
    if (match[0]) candidates.push(match[0]);
    if (match[1]) candidates.push(match[1]);
  }
  for (const match of text.matchAll(/\$+([^$]+)\$+/g)) {
    if (match[1]) candidates.push(match[1]);
  }
  for (const match of text.matchAll(/\\(?:\[|\()([\s\S]+?)\\(?:\]|\))/g)) {
    if (match[1]) candidates.push(match[1]);
  }
  for (const match of text.matchAll(/\b(?:grafik|plot|kurva|graph|fungsi|persamaan)(?:\s+(?:fungsi|dari|untuk|persamaan|seperti))*\s+([^$\n,;]+)/gi)) {
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

function quadraticConceptPlot(claimRefs: readonly string[]): CanvasSpec | null {
  return parseCanvasSpec({
    version: "zyra-learning-canvas-v1",
    type: "function_plot",
    title: "Visual fungsi kuadrat",
    purpose: "Mengamati pengaruh koefisien a, b, dan c pada y = ax^2 + bx + c. Nilai a harus bukan nol agar fungsi tetap kuadrat.",
    variables: [
      { id: "a", label: "Koefisien a", min: -3, max: 3, defaultValue: 1 },
      { id: "b", label: "Koefisien b", min: -6, max: 6, defaultValue: 0 },
      { id: "c", label: "Konstanta c", min: -6, max: 6, defaultValue: 0 },
    ],
    controls: [
      { variableId: "a", label: "Koefisien a", min: -3, max: 3, step: 0.05, presets: [-2, -1, -0.08, 1, 2] },
      { variableId: "b", label: "Koefisien b", min: -6, max: 6, step: 0.5, presets: [-4, -2, 0, 2, 4] },
      { variableId: "c", label: "Konstanta c", min: -6, max: 6, step: 0.5, presets: [-4, -2, 0, 2, 4] },
    ],
    claimRefs: [...claimRefs].slice(0, 12),
    altText: "Grafik y sama dengan a x kuadrat ditambah b x ditambah c dengan koefisien yang dapat diubah dan syarat a bukan nol.",
    domain: { min: -8, max: 8, sampleCount: 241 },
    series: [{ id: "quadratic", label: "y", expression: "a*x^2 + b*x + c" }],
    fallback: {
      summary: "Bentuk umum fungsi kuadrat, syarat a bukan nol, dan nilai awal koefisien pada grafik.",
      columns: [
        { id: "form", label: "Bentuk fungsi" },
        { id: "a", label: "a" },
        { id: "b", label: "b" },
        { id: "c", label: "c" },
      ],
      rows: [["y = ax^2 + bx + c", "1", "0", "0"]],
    },
  });
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
  if (expressions.length === 0) {
    return QUADRATIC_INTENT.test(input.learnerQuestion)
      ? quadraticConceptPlot(input.claimRefs)
      : null;
  }

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
