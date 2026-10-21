import { splitScientificText } from "./text-segments";

export const V4_SCIENTIFIC_PROSE_POLICY = "v4-scientific-prose.v1";

const scientificNumberLiteral = /(?<![\w.])[+-]?(?:\d+(?:\.\d*)?|\.\d+)[eE][+-]?\d+(?!\w)/;
function unformattedScientificNumber(latex: string): string | null {
  return latex.replace(/\\pu\{[^{}]*\}/g, "").match(scientificNumberLiteral)?.[0] ?? null;
}

const unmarkedNotation = /\b(?:[A-Za-z0-9]+|\))\s*\^\s*(?:\{[^}\n]+\}|\([^\n)]+\)|[+-]?\d+|[A-Za-z]\b)|(?<![\w.])[+-]?(?:\d+(?:\.\d*)?|\.\d+)[eE][+-]?\d+(?!\w)|[α-ωΑ-Ωϵϑϕϱϰϖµℝℤℚℕℂ∈∉≤≥≠≈≡→⇒⇔∀∃∂∇∑∏∫√∞±×÷⊂⊆∩∪⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻₀₁₂₃₄₅₆₇₈₉]|\b(?:epsilon|delta|alpha|beta|gamma|theta|lambda|mu|sigma|omega)\s*[<>=]|\b[A-Za-z]\([A-Za-z0-9, ]+\)\s*[=<>]|\b[A-Za-z]\s*[=<>]\s*[A-Za-z0-9+-]|\\(?:alpha|beta|gamma|delta|epsilon|varepsilon|theta|lambda|sigma|omega|frac|sqrt|lim|times|cdot)\b/u;

/** Flag obvious prose notation and numeric e literals; never rewrite content or inspect code. */
export function findUnmarkedScientificNotation(prose: string): string | null {
  for (const segment of splitScientificText(prose)) {
    if (segment.type === "code") continue;
    const visible = segment.type === "text" ? segment.value.replace(/<!--[\s\S]*?-->/g, "").replace(/(!?\[[^\]]*\])\([^)\n]*\)/g, "$1") : segment.value;
    const scientific = unformattedScientificNumber(visible);
    if (scientific) return scientific;
    if (segment.type === "math") continue;
    for (const candidate of visible.matchAll(/\|([^|\n]+)\|/g)) {
      const body = candidate[1].trim();
      if (/^(?:[A-Za-z]|epsilon|delta)$/.test(body) || (/[+*/()\-]/.test(body) && /(?:^|[^A-Za-z])\d*[A-Za-z](?:\([^)]*\))?(?=$|[^A-Za-z])/.test(body))) return candidate[0];
    }
    const match = visible.match(unmarkedNotation);
    if (match) return match[0];
  }
  return null;
}

const proseFields = new Set(["markdown", "meaningMarkdown", "conditionsMarkdown", "operationMarkdown", "reasonMarkdown", "problemMarkdown", "verificationMarkdown", "captionMarkdown", "staticMarkdown", "xLabel", "yLabel", "contentMarkdown", "title", "label", "description", "explanation", "reason", "verification", "text", "summary", "content", "altText", "learningObjective", "interpretation", "bodyMarkdown", "applicationMarkdown", "problemStatement", "headers"]);

/** Only learner prose fields are inspected, not IDs, formula models, numeric tables or provenance. */
export function findUnmarkedScientificProse(value: unknown): { path: string; notation: string }[] {
  const findings: { path: string; notation: string }[] = [];
  function visit(current: unknown, path: string, prose: boolean, formula = false) {
    if (typeof current === "string" && formula) {
      const notation = unformattedScientificNumber(current);
      if (notation) findings.push({ path, notation });
    } else if (typeof current === "string" && prose) {
      const notation = findUnmarkedScientificNotation(current);
      if (notation) findings.push({ path, notation });
    } else if (Array.isArray(current)) current.forEach((item, index) => visit(item, `${path}[${index}]`, prose));
    else if (current && typeof current === "object") for (const [key, item] of Object.entries(current)) visit(item, path ? `${path}.${key}` : key, proseFields.has(key), ["latex", "conditionLatex", "labelLatex"].includes(key));
  }
  visit(value, "", false);
  return findings;
}
