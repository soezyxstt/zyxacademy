/**
 * Short answer normalization and deterministic verification utilities.
 * Handles chemistry equations, math formulas, numeric inputs, and standard text phrases.
 */

/**
 * Normalizes an answer string for canonical comparison.
 * - Strips enclosing math delimiters ($, $$, \(, \), \[, \], backticks)
 * - Normalizes Unicode and mathematical symbols (NFKC, minus signs, dashes)
 * - Lowercases for case-insensitive matching
 * - Normalizes chemical & math arrows (\to, \rightarrow, -->, -> to →; <=> to ⇌)
 * - Strips LaTeX formatting macros (\text, \mathrm, \mathbf, \left, \right)
 * - Normalizes sub/superscript notation:
 *   - _{(g)} -> (g), _{g} -> _g
 *   - ^{...} -> ^...
 *   - Unicode superscripts/subscripts (⁺, ⁻, ⁰-⁹, ₀-₉) to ASCII ^+, ^-, etc.
 * - Collapses spaces around stoichiometric coefficients (e.g. "2 H2" -> "2h2")
 * - Normalizes electron notation: "e^-", "e-", "e⁻" -> "e^-"
 * - Normalizes charges: "Mg^+" and "Mg+"
 * - Collapses spaces around operators (+, -, =, *, /, ^, _, →, ⇌, (, ), [, ], {, }, ,)
 * - Eliminates spaces between chemical species and phase indicators: "mg (g)" -> "mg(g)"
 * - Normalizes comma as decimal separator between digits (e.g. "12,5" -> "12.5")
 * - Strips trailing punctuation like "." for plain language terms
 */
export function normalizeShortAnswer(input: unknown): string {
  if (typeof input !== "string") {
    if (input === null || input === undefined) return "";
    return String(input).trim().toLowerCase();
  }

  let s = input.trim();
  if (!s) return "";

  // 1. Strip surrounding math delimiters and backticks
  s = s.replace(/^\$\$([\s\S]*)\$\$$/, "$1");
  s = s.replace(/^\$([\s\S]*)\$$/, "$1");
  s = s.replace(/^\\\[([\s\S]*)\\\]$/, "$1");
  s = s.replace(/^\\\(([\s\S]*)\\\)$/, "$1");
  s = s.replace(/^`([\s\S]*)`$/, "$1");
  s = s.trim();

  // 2. Normalize backslashes (collapse duplicate backslashes)
  s = s.replace(/\\{2,}/g, "\\");

  // 3. Normalize arrows before stripping other LaTeX commands
  // Reversible arrows must run before one-way arrows to prevent partial matches (e.g. <->)
  s = s.replace(/\\rightleftharpoons\b|<=>|<->/g, "⇌");
  s = s.replace(/\\longrightarrow\b|\\rightarrow\b|\\to\b|-->|->/g, "→");
  s = s.replace(/\\longleftarrow\b|\\leftarrow\b|<--|<-/g, "←");

  // 4. Strip LaTeX wrapper commands (\text{...}, \mathrm{...}, \mathbf{...})
  s = s.replace(/\\(?:text|mathrm|mathbf|mathit|textbf|textrm)\{([^}]*)\}/g, "$1");
  s = s.replace(/\\(?:left|right)\b/g, "");

  // 5. Normalize LaTeX phase subscripts: e.g. "_{(g)}" -> "(g)", "_{(s)}" -> "(s)"
  s = s.replace(/_\{\s*\((g|s|l|aq)\)\s*\}/gi, "($1)");
  s = s.replace(/_\((g|s|l|aq)\)/gi, "($1)");

  // 6. Normalize LaTeX superscripts/subscripts braces: e.g. "^{2+}" -> "^2+", "_{2}" -> "_2"
  s = s.replace(/\^\{([^}]+)\}/g, "^$1");
  s = s.replace(/_\{([^}]+)\}/g, "_$1");

  // 7. Unicode and case normalization
  // Map various dashes/minuses to ASCII hyphen
  s = s.replace(/[\u2212\u2013\u2014]/g, "-");

  // Map Unicode superscripts and subscripts
  const superMap: Record<string, string> = {
    "⁺": "^+", "⁻": "^-", "⁰": "^0", "¹": "^1", "²": "^2", "³": "^3",
    "⁴": "^4", "⁵": "^5", "⁶": "^6", "⁷": "^7", "⁸": "^8", "⁹": "^9"
  };
  s = s.replace(/[⁺⁻⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (char) => superMap[char] || char);

  const subMap: Record<string, string> = {
    "₀": "_0", "₁": "_1", "₂": "_2", "₃": "_3", "₄": "_4",
    "₅": "_5", "₆": "_6", "₇": "_7", "₈": "_8", "₉": "_9"
  };
  s = s.replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (char) => subMap[char] || char);

  s = s.normalize("NFKC").toLowerCase();
  s = s.replace(/[\u2212\u2013\u2014]/g, "-");

  // 8. Normalise electrons: e^-, e-, 3e-, 3e^- -> e^-
  s = s.replace(/(^|[^a-zA-Z])e\^?-(?=[^a-zA-Z]|$)/g, "$1e^-");

  // 9. Standardize superscripts on single charges if omitted: e.g. "mg^+" vs "mg+"
  // Convert species^+ to species^+ (consistent caret for ions)
  s = s.replace(/\^([0-9]*[+-])/g, "^$1");
  s = s.replace(/([a-zA-Z\)])\+([^+a-zA-Z0-9]|$)/g, "$1^++$2");

  // 10. Collapse spaces between stoichiometric coefficients and chemical terms: "2 h2" -> "2h2"
  s = s.replace(/(\d+)\s+([a-zA-Z])/g, "$1$2");

  // 11. Collapse spaces between chemical formulas and phase parentheses: "mg (g)" -> "mg(g)"
  s = s.replace(/([a-z0-9\^_\+\-]+)\s+\((g|s|l|aq)\)/gi, "$1($2)");

  // 12. Decimal comma normalization between digits: "12,5" -> "12.5"
  s = s.replace(/(\d+),(\d+)/g, "$1.$2");

  // 13. Collapse spaces around operators and delimiters
  s = s.replace(/\s*([+\-=*\/^()\[\]{}→←⇌,;:<>_])\s*/g, "$1");

  // 14. Clean any residual backslashes
  s = s.replace(/\\/g, "");

  // 15. Normalize multiple spaces to single space
  s = s.replace(/\s+/g, " ").trim();

  // 16. Strip trailing periods unconditionally (including numeric inputs like "5.")
  s = s.replace(/\.+$/, "").trim();

  return s;
}

/**
 * Checks whether a student's submitted short answer matches any of the acceptable answers.
 * Returns true if there is an exact match or a normalized match.
 */
export function isShortAnswerCorrect(
  submitted: unknown,
  acceptableAnswers: unknown[] | null | undefined
): boolean {
  if (!acceptableAnswers || !Array.isArray(acceptableAnswers) || acceptableAnswers.length === 0) {
    return false;
  }

  const rawSubmitted = typeof submitted === "string"
    ? submitted
    : Array.isArray(submitted)
    ? String(submitted[0] ?? "")
    : submitted !== null && typeof submitted === "object" && "text" in submitted && typeof (submitted as { text?: unknown }).text === "string"
    ? (submitted as { text: string }).text
    : submitted !== null && submitted !== undefined
    ? String(submitted)
    : "";

  const trimmedSubmitted = rawSubmitted.trim();
  if (!trimmedSubmitted) return false;

  const lowerSubmitted = trimmedSubmitted.toLowerCase();
  const normalizedSubmitted = normalizeShortAnswer(trimmedSubmitted);

  for (const ans of acceptableAnswers) {
    if (ans === null || ans === undefined) continue;
    const ansStr = String(ans).trim();
    if (!ansStr) continue;

    // 1. Fast exact case-insensitive match
    if (ansStr.toLowerCase() === lowerSubmitted) {
      return true;
    }

    // 2. Canonical normalized match
    const normalizedAns = normalizeShortAnswer(ansStr);
    if (normalizedAns && normalizedAns === normalizedSubmitted) {
      return true;
    }
  }

  return false;
}

/**
 * Filters and deduplicates acceptable answers to display in the UI.
 * Strips duplicate variations that normalize to the same formula,
 * preferring cleaner rendered LaTeX/text forms.
 */
export function deduplicateAcceptableAnswers(answers: unknown[] | null | undefined): string[] {
  if (!answers || !Array.isArray(answers)) return [];

  const seenNormalized = new Set<string>();
  const result: string[] = [];

  for (const item of answers) {
    if (item === null || item === undefined) continue;
    const str = String(item).trim();
    if (!str) continue;

    const norm = normalizeShortAnswer(str);
    if (!seenNormalized.has(norm)) {
      seenNormalized.add(norm);
      result.push(str);
    }
  }

  return result.length > 0 ? result : (answers.map(String).filter(Boolean));
}
