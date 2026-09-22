/**
 * Scientific Answer Normalizer and Syntax Validator
 * Supports Math, Physics, and Chemistry notations for short answer questions.
 */

export interface ScientificValidationResult {
  isValid: boolean;
  error?: string;
  latex: string;
  normalized: string;
}

/**
 * Checks whether brackets and braces are balanced.
 */
export function checkBracketBalance(text: string): { balanced: boolean; error?: string } {
  if (!text) return { balanced: true };

  const stack: { char: string; index: number }[] = [];
  const pairs: Record<string, string> = {
    "}": "{",
    "]": "[",
    ")": "(",
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    // Skip escaped brackets
    if (i > 0 && text[i - 1] === "\\") continue;

    if (ch === "{" || ch === "[" || ch === "(") {
      stack.push({ char: ch, index: i });
    } else if (ch === "}" || ch === "]" || ch === ")") {
      const expected = pairs[ch];
      if (stack.length === 0 || stack[stack.length - 1].char !== expected) {
        return {
          balanced: false,
          error: "Tanda kurung penutup tidak cocok atau berlebih.",
        };
      }
      stack.pop();
    }
  }

  if (stack.length > 0) {
    const unclosed = stack[stack.length - 1].char;
    if (unclosed === "{") {
      return { balanced: false, error: "Kurung kurawal belum tertutup." };
    }
    if (unclosed === "[") {
      return { balanced: false, error: "Kurung siku belum tertutup." };
    }
    return { balanced: false, error: "Kurung buka belum tertutup." };
  }

  return { balanced: true };
}

/**
 * Normalizes user typing (shortcuts, Greek names, chemical formulas) into canonical LaTeX for KaTeX.
 */
export function scientificTextToLatex(input: string): string {
  if (!input || !input.trim()) return "";

  let s = input.trim();

  // 1. Relational & Operator shortcuts
  s = s.replace(/<=/g, " \\le ")
       .replace(/>=/g, " \\ge ")
       .replace(/!=/g, " \\ne ")
       .replace(/\+-|\+\/-/g, " \\pm ")
       .replace(/-\+/g, " \\mp ")
       .replace(/\bplus minus\b/gi, " \\pm ");

  // 2. Roots & common function shortcuts
  s = s.replace(/√\s*\(\s*([^()]*)\s*\)/g, "\\sqrt{$1}")
       .replace(/√\s*([^\s()]+)/g, "\\sqrt{$1}")
       .replace(/\bakar\s*([0-9a-zA-Z]+)/gi, "\\sqrt{$1}")
       .replace(/sqrt\(([^)]+)\)/g, "\\sqrt{$1}")
       .replace(/akar\(([^)]+)\)/gi, "\\sqrt{$1}");

  // 3. Greek letter shortcuts (case-insensitive for named symbols if standalone)
  const greekLetters = [
    "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta",
    "iota", "kappa", "lambda", "mu", "nu", "xi", "pi", "rho", "sigma",
    "tau", "upsilon", "phi", "chi", "psi", "omega",
    "Gamma", "Delta", "Theta", "Lambda", "Xi", "Pi", "Sigma", "Upsilon", "Phi", "Psi", "Omega"
  ];
  const uppercaseGreek = new Set([
    "Gamma", "Delta", "Theta", "Lambda", "Xi", "Pi", "Sigma", "Upsilon", "Phi", "Psi", "Omega"
  ]);
  for (const g of greekLetters) {
    const regex = new RegExp(`(?<![\\\\a-zA-Z])${g}(?![a-zA-Z])`, "g");
    const replacement = uppercaseGreek.has(g) ? `\\${g}` : `\\${g.toLowerCase()}`;
    s = s.replace(regex, replacement);
  }

  // 4. Degree shortcut
  s = s.replace(/\bderajat\b/gi, "^\\circ")
       .replace(/(?<=\d)\s*°C/g, "^\\circ\\text{C}")
       .replace(/(?<=\d)\s*°/g, "^\\circ");

  // 5. Scientific powers of 10: e.g. 10^-3 -> 10^{-3}, 10^5 -> 10^{5}
  s = s.replace(/(?<![0-9a-zA-Z])10\^([+-]?\d+)/g, "10^{$1}");

  // 6. Chemical Reaction Arrows & Equilibrium
  s = s.replace(/<=>|<->|⇌/g, " \\rightleftharpoons ")
       .replace(/->|→/g, " \\rightarrow ")
       .replace(/<->|↔/g, " \\leftrightarrow ");

  // 7. Chemical Ion Charges: e.g. Ca2+ -> Ca^{2+}, Fe3+ -> Fe^{3+}, OH- -> OH^-
  s = s.replace(/\b([A-Z][a-z]?)(\d+[+-]|[+-])(?!\w)/g, "$1^{$2}");
  s = s.replace(/\(([^)]+)\)(\d+[+-]|[+-])(?!\w)/g, "($1)^{$2}");

  // 8. Chemical Formulas with parenthesized groups: e.g. Ca(OH)2 -> Ca(OH)_2, (NH4)2SO4 -> (NH4)_2SO_4
  s = s.replace(/\(([^)]+)\)(\d+)/g, "($1)_$2");

  // 9. Auto-subscript Chemical Formulas: e.g. H2O -> H_2O, CO2 -> CO_2
  // Match Element symbol followed by number when not already marked with _ or ^
  if (!s.includes("_")) {
    s = s.replace(/([A-Z][a-z]?)(\d+)(?![+-])/g, "$1_$2");
  }

  // 10. Auto-brace single-digit exponents or subscripts if needed
  s = s.replace(/\^([a-zA-Z0-9+-]{2,})/g, (match, inner) => {
    if (inner.startsWith("{")) return match;
    return `^{${inner}}`;
  });

  // 11. Scientific physical units formatting with \text{} so units render upright in KaTeX
  s = s.replace(
    /(?<=(?:\d|\}))\s*(nm|cm|mm|km|m\/s\^2|m\/s2|m\/s|Hz|kHz|MHz|GHz|kJ|J|eV|mol|kg|rad)(?:(-?\d+)|\^(-?\d+))?(?![a-zA-Z0-9_{^])/g,
    (_, unit, p1, p2) => {
      const pow = p1 || p2;
      if (pow) {
        return ` \\text{ ${unit}}^{${pow}}`;
      }
      return ` \\text{ ${unit}}`;
    }
  );
  s = s.replace(
    /(?<=(?:\d|\}))\s+(m|s|g)(?:(-?\d+)|\^(-?\d+))?(?![a-zA-Z0-9_{^])/g,
    (_, unit, p1, p2) => {
      const pow = p1 || p2;
      if (pow) {
        return ` \\text{ ${unit}}^{${pow}}`;
      }
      return ` \\text{ ${unit}}`;
    }
  );

  // Clean duplicate spaces
  s = s.replace(/\s{2,}/g, " ").trim();

  return s;
}

/**
 * Normalizes input for deterministic string grading comparison.
 * Trims whitespace, standardizes operators, and lowercases variable letters where appropriate.
 */
export function canonicalizeScientificAnswer(raw: string): string {
  if (!raw) return "";

  let s = raw.trim().toLowerCase();

  // Normalize common equivalents
  s = s.replace(/\\pm|\+-|\+\/-/g, "±")
       .replace(/\\mp|-\+/g, "∓")
       .replace(/\\times|\*|×/g, "×")
       .replace(/\\div|÷|\//g, "/")
       .replace(/\\le|<=|≤/g, "≤")
       .replace(/\\ge|>=|≥/g, "≥")
       .replace(/\\ne|!=|≠/g, "≠")
       .replace(/\\approx|≈/g, "≈")
       .replace(/\\pi|π/g, "π")
       .replace(/\\theta|θ/g, "θ")
       .replace(/\\lambda|λ/g, "λ")
       .replace(/\\alpha|α/g, "α")
       .replace(/\\beta|β/g, "β")
       .replace(/\\gamma|γ/g, "γ")
       .replace(/\\delta|δ/g, "δ")
       .replace(/\\omega|ω/g, "ω")
       .replace(/\\sigma|σ/g, "σ")
       .replace(/\\mu|μ/g, "μ")
       .replace(/\\rightarrow|->|→/g, "→")
       .replace(/\\rightleftharpoons|<=>|⇌/g, "⇌");

  // Remove LaTeX wrappers like \text{}, \mathrm{}, \mathbf{}
  s = s.replace(/\\text\{\s*([^}]+)\s*\}/g, "$1")
       .replace(/\\mathrm\{\s*([^}]+)\s*\}/g, "$1")
       .replace(/\\mathbf\{\s*([^}]+)\s*\}/g, "$1");

  // Remove unnecessary outer curly braces from powers and scripts: ^{2} -> ^2
  s = s.replace(/\^{([a-z0-9+-]+)}/g, "^$1");
  s = s.replace(/_{([a-z0-9+-]+)}/g, "_$1");

  // Standardize spaces around operators, including ±
  s = s.replace(/\s*([=+\-×/≤≥≠≈→⇌±∓])\s*/g, " $1 ");

  // Clean extra spaces
  s = s.replace(/\s+/g, " ").trim();

  return s;
}

/**
 * Validates syntax and returns both KaTeX-ready string and canonical normalized string.
 */
export function validateAndNormalizeScientificAnswer(raw: string): ScientificValidationResult {
  const balance = checkBracketBalance(raw);
  if (!balance.balanced) {
    return {
      isValid: false,
      error: balance.error,
      latex: raw,
      normalized: canonicalizeScientificAnswer(raw),
    };
  }

  const latex = scientificTextToLatex(raw);
  const normalized = canonicalizeScientificAnswer(raw);

  return {
    isValid: true,
    latex,
    normalized,
  };
}
