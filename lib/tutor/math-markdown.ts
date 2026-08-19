/**
 * Adds safe delimiters to common raw equations emitted by a provider.
 * Existing LaTeX, inline code, and fenced code remain unchanged.
 */
export function normalizeTutorMathMarkdown(text: string): string {
  const protectedSegments: string[] = [];
  const protectedText = text.replace(
    /```[\s\S]*?```|`[^`\n]*`|\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\[[\s\S]*?\\\]|\\\([^\n]*?\\\)/g,
    (segment) => {
      const marker = `@@ZYRA_MATH_${protectedSegments.length}@@`;
      protectedSegments.push(segment);
      return marker;
    },
  );

  const equationSegments: string[] = [];
  const withEquations = protectedText.replace(
    /\b([A-Za-z](?:')?\([^\n)]+\)\s*=\s*[-+]?[^,.;:!?\n]+)/g,
    (equation) => {
      const marker = `@@ZYRA_EQUATION_${equationSegments.length}@@`;
      equationSegments.push(`$${equation.trim()}$`);
      return marker;
    },
  );

  const withPolynomials = withEquations.replace(
    /\b(\d*[A-Za-z](?:\^\{?-?\d+\}?)?(?:\s*[+-]\s*\d*[A-Za-z](?:\^\{?-?\d+\}?)?)+)\b/g,
    (expression) => `$${expression.trim()}$`,
  );

  return withPolynomials
    .replace(/@@ZYRA_EQUATION_(\d+)@@/g, (_, index: string) => equationSegments[Number(index)] ?? "")
    .replace(/@@ZYRA_MATH_(\d+)@@/g, (_, index: string) => protectedSegments[Number(index)] ?? "");
}
