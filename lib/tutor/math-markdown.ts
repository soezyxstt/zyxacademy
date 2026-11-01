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
      // Providers sometimes double-escape line breaks inside display math.
      // Keep LaTeX commands such as \neq and \nabla intact.
      const isDisplay = segment.startsWith("$$") || segment.startsWith("\\[");
      protectedSegments.push(isDisplay
        ? segment.replace(/\\n(?=\\|\s|\$\$|$)/g, "\n")
        : segment);
      return marker;
    },
  );

  // Unescape literal \n strings outside math/code blocks (fixes raw "\n" prefix bugs)
  const cleanNewlines = protectedText.replace(/\\n(?!(?:abla|eq|e|u|ot|eg|i|exists|subseteq|parallel|mid|olinebreak|ewcommand|ewline)\b)/g, "\n");

  const equationSegments: string[] = [];
  const withEquations = cleanNewlines.replace(
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

  const formulaRows = withPolynomials.replace(
    /^(\s*)(@@ZYRA_MATH_\d+@@)([ \t]*)$/gm,
    (row, _indent: string, marker: string) => {
      const index = Number(marker.match(/\d+/)?.[0]);
      const formula = protectedSegments[index];
      if (formula?.startsWith("$") && !formula.startsWith("$$")) {
        protectedSegments[index] = `$$\n${formula.slice(1, -1)}\n$$`;
        return `\n${marker}\n`;
      }
      return row;
    },
  );

  return formulaRows
    .replace(/@@ZYRA_EQUATION_(\d+)@@/g, (_, index: string) => equationSegments[Number(index)] ?? "")
    .replace(/@@ZYRA_MATH_(\d+)@@/g, (_, index: string) => protectedSegments[Number(index)] ?? "");
}
