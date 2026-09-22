/**
 * Utility to normalize mathematical expressions and symbols in natural language text (e.g. Indonesian)
 * so that KaTeX can render them properly via MathText.
 *
 * Preserves text that already contains explicit LaTeX delimiters ($...$, $$...$$, \(...\), \[...\]).
 */

interface ParseCmdResult {
  success: boolean;
  endIndex: number;
}

function parseBalancedBraces(text: string, startIndex: number): { content: string; endIndex: number } | null {
  if (text[startIndex] !== "{") return null;
  let depth = 0;
  for (let i = startIndex; i < text.length; i++) {
    if (text[i] === "\\") {
      i++;
      continue;
    }
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) {
        return { content: text.slice(startIndex, i + 1), endIndex: i + 1 };
      }
    }
  }
  return null;
}

function parseBalancedBrackets(text: string, startIndex: number): { content: string; endIndex: number } | null {
  if (text[startIndex] !== "[") return null;
  let depth = 0;
  for (let i = startIndex; i < text.length; i++) {
    if (text[i] === "\\") {
      i++;
      continue;
    }
    if (text[i] === "[") depth++;
    else if (text[i] === "]") {
      depth--;
      if (depth === 0) {
        return { content: text.slice(startIndex, i + 1), endIndex: i + 1 };
      }
    }
  }
  return null;
}

function parseScripts(text: string, startIndex: number): number | null {
  let index = startIndex;
  while (index < text.length) {
    if (text[index] === "_" || text[index] === "^") {
      index++;
      if (index < text.length && text[index] === "{") {
        const brace = parseBalancedBraces(text, index);
        if (brace) {
          index = brace.endIndex;
        } else {
          return null; // Unbalanced brace in script
        }
      } else if (index < text.length && /[a-zA-Z0-9]/.test(text[index])) {
        index++;
      } else {
        break;
      }
    } else {
      break;
    }
  }
  return index;
}

const TWO_ARG_COMMANDS = new Set(["frac", "dfrac", "tfrac"]);
const ONE_ARG_COMMANDS = new Set([
  "sqrt",
  "mathbb",
  "mathcal",
  "mathbf",
  "mathrm",
  "text",
  "operatorname",
]);
const ZERO_ARG_COMMANDS = new Set([
  "sum", "int", "iint", "iiint", "oint", "prod",
  "alpha", "beta", "gamma", "varepsilon", "zeta", "eta", "iota", "kappa", "lambda", "mu", "nu", "xi", "rho", "tau", "upsilon", "phi", "chi", "psi", "omega",
  "Gamma", "Delta", "Theta", "Lambda", "Xi", "Pi", "Sigma", "Upsilon", "Phi", "Psi", "Omega",
  "pm", "mp", "cdot", "times", "div", "leq", "geq", "ne", "neq", "approx", "equiv",
  "in", "notin", "subset", "subseteq", "cap", "cup", "setminus", "emptyset", "infty",
  "partial", "nabla", "forall", "exists",
]);

function parseCommandExpression(text: string, cmd: string, cmdEnd: number): ParseCmdResult {
  if (TWO_ARG_COMMANDS.has(cmd)) {
    let pos = cmdEnd;
    while (pos < text.length && /\s/.test(text[pos])) pos++;
    if (pos >= text.length || text[pos] !== "{") {
      return { success: false, endIndex: pos };
    }
    const arg1 = parseBalancedBraces(text, pos);
    if (!arg1) {
      return { success: false, endIndex: text.length };
    }
    pos = arg1.endIndex;
    while (pos < text.length && /\s/.test(text[pos])) pos++;
    if (pos >= text.length || text[pos] !== "{") {
      return { success: false, endIndex: pos };
    }
    const arg2 = parseBalancedBraces(text, pos);
    if (!arg2) {
      return { success: false, endIndex: text.length };
    }
    pos = arg2.endIndex;
    const afterScripts = parseScripts(text, pos);
    if (afterScripts === null) {
      return { success: false, endIndex: text.length };
    }
    return { success: true, endIndex: afterScripts };
  }

  if (cmd === "sqrt") {
    let pos = cmdEnd;
    while (pos < text.length && /\s/.test(text[pos])) pos++;
    if (pos < text.length && text[pos] === "[") {
      const opt = parseBalancedBrackets(text, pos);
      if (!opt) return { success: false, endIndex: text.length };
      pos = opt.endIndex;
      while (pos < text.length && /\s/.test(text[pos])) pos++;
    }
    if (pos < text.length && text[pos] === "{") {
      const arg = parseBalancedBraces(text, pos);
      if (!arg) return { success: false, endIndex: text.length };
      pos = arg.endIndex;
    } else if (pos < text.length && /[a-zA-Z0-9]/.test(text[pos])) {
      pos++;
    } else {
      return { success: false, endIndex: pos };
    }
    const afterScripts = parseScripts(text, pos);
    if (afterScripts === null) return { success: false, endIndex: text.length };
    return { success: true, endIndex: afterScripts };
  }

  if (ONE_ARG_COMMANDS.has(cmd)) {
    let pos = cmdEnd;
    while (pos < text.length && /\s/.test(text[pos])) pos++;
    if (pos >= text.length || text[pos] !== "{") return { success: false, endIndex: pos };
    const arg = parseBalancedBraces(text, pos);
    if (!arg) return { success: false, endIndex: text.length };
    const afterScripts = parseScripts(text, arg.endIndex);
    if (afterScripts === null) return { success: false, endIndex: text.length };
    return { success: true, endIndex: afterScripts };
  }

  if (ZERO_ARG_COMMANDS.has(cmd)) {
    const afterScripts = parseScripts(text, cmdEnd);
    if (afterScripts === null) return { success: false, endIndex: text.length };
    return { success: true, endIndex: afterScripts };
  }

  return { success: false, endIndex: cmdEnd };
}

function normalizeBareLatexCommands(text: string): string {
  let result = "";
  let i = 0;

  while (i < text.length) {
    if (text.startsWith("$$", i)) {
      const closeIdx = text.indexOf("$$", i + 2);
      if (closeIdx !== -1) {
        result += text.slice(i, closeIdx + 2);
        i = closeIdx + 2;
        continue;
      }
    } else if (text[i] === "$") {
      const closeIdx = text.indexOf("$", i + 1);
      if (closeIdx !== -1) {
        result += text.slice(i, closeIdx + 1);
        i = closeIdx + 1;
        continue;
      }
    }

    if (text[i] === "\\" && i + 1 < text.length && /[a-zA-Z]/.test(text[i + 1])) {
      if (i > 0 && text[i - 1] === "$") {
        result += text[i];
        i++;
        continue;
      }

      const match = text.slice(i + 1).match(/^[a-zA-Z]+/);
      if (match) {
        const cmd = match[0];
        const cmdEnd = i + 1 + cmd.length;

        if (TWO_ARG_COMMANDS.has(cmd) || ONE_ARG_COMMANDS.has(cmd) || ZERO_ARG_COMMANDS.has(cmd)) {
          const parsed = parseCommandExpression(text, cmd, cmdEnd);
          if (parsed.success) {
            const expr = text.slice(i, parsed.endIndex);
            result += ` $${expr.trim()}$ `;
            i = parsed.endIndex;
            continue;
          } else {
            // Failed to capture required arguments or unbalanced braces.
            // Leave complete expression unwrapped instead of wrapping nested commands independently.
            let skipTo = parsed.endIndex;
            if (skipTo <= i) {
              skipTo = cmdEnd;
            }
            result += text.slice(i, skipTo);
            i = skipTo;
            continue;
          }
        }
      }
    }

    result += text[i];
    i++;
  }

  return result;
}

function formatChemicalTerm(term: string): string {
  const t = term.trim();
  if (t === "e-") return "\\text{e}^-";

  const phaseMatch = t.match(/^([A-Za-z]+)(\d*[+-])?\s*\((g|s|l|aq)\)$/);
  if (phaseMatch) {
    const [, element, charge, phase] = phaseMatch;
    const el = `\\text{${element}}`;
    const ch = charge ? `^{${charge}}` : "";
    const ph = `_{(${phase})}`;
    return `${el}${ch}${ph}`;
  }

  const ionMatch = t.match(/^([A-Za-z]+)(\d*[+-])$/);
  if (ionMatch) {
    const [, element, charge] = ionMatch;
    return `\\text{${element}}^{${charge}}`;
  }

  if (/^[A-Z][a-z]?$/.test(t)) {
    return `\\text{${t}}`;
  }

  return t;
}

function parseAndFormatChemicalSide(side: string): string {
  const termRegex = /([A-Za-z]+(?:\d*[+-])?(?:\((?:g|s|l|aq)\))?|e-)/g;
  const matches = [...side.matchAll(termRegex)].map((m) => m[0]);
  return matches.map(formatChemicalTerm).join(" + ");
}

function formatUnit(unit: string): string {
  const u = unit.trim();
  if (!u) return "";
  const powMatch = u.match(/^([a-zA-Z/]+)(-?\d+)$/);
  if (powMatch) {
    return `\\text{ ${powMatch[1]}}^{${powMatch[2]}}`;
  }
  return `\\text{ ${u}}`;
}

/**
 * Normalizes unwrapped mathematical expressions within a plain text segment into LaTeX ($...$).
 */
function normalizePlainTextSegment(text: string): string {
  if (!text || !text.trim()) return text;

  let s = text;

  // 0a. Chemical reaction equations in text or options:
  // e.g. "X(g)→X+(g)+e-", "X(g)+e- → X-(g)", "Mg(g)→Mg+(g)+e-", "Mg(g) -> Mg+(g) + e-"
  s = s.replace(
    /(?:[A-Za-z]+(?:\d*[+-])?(?:\((?:g|s|l|aq)\))?|e-)(?:\s*\+\s*(?:[A-Za-z]+(?:\d*[+-])?(?:\((?:g|s|l|aq)\))?|e-))*\s*(?:→|->|<=>|<->)\s*(?:[A-Za-z]+(?:\d*[+-])?(?:\((?:g|s|l|aq)\))?|e-)(?:\s*\+\s*(?:[A-Za-z]+(?:\d*[+-])?(?:\((?:g|s|l|aq)\))?|e-))*/g,
    (match) => {
      const arrowMatch = match.match(/\s*(?:→|->|<=>|<->)\s*/);
      if (!arrowMatch || arrowMatch.index === undefined) return match;
      const arrow = arrowMatch[0];
      const leftRaw = match.slice(0, arrowMatch.index);
      const rightRaw = match.slice(arrowMatch.index + arrow.length);

      const left = parseAndFormatChemicalSide(leftRaw);
      const right = parseAndFormatChemicalSide(rightRaw);
      return ` $${left} \\rightarrow ${right}$ `;
    }
  );

  // 0b. Standalone chemical ions: e.g. "ion He+", "ion Mg2+", "spesi X+"
  s = s.replace(
    /(?<![\\$a-zA-Z0-9])\b(He|Li|Be|Na|Mg|Al|K|Ca|Sc|Ti|V|Cr|Mn|Fe|Co|Ni|Cu|Zn|Ga|Rb|Sr|Ag|Cd|In|Sn|Cs|Ba|Tl|Pb|Bi|NH4|H3O|H|X|F|Cl|Br|I|O|S|N|P|OH|NO3|SO4|CO3|PO4)(\d?[+-])(?!\()/g,
    (_, element, charge) => ` $\\text{${element}}^{${charge}}$ `
  );
  s = s.replace(/(?<![\\$a-zA-Z0-9])\be-(?![\\$a-zA-Z0-9])/g, () => ` $\\text{e}^-$ `);

  // 0c. Rydberg formula and full equation chains:
  // e.g. "1/lambda=RZ^2(1/n1^2-1/n2^2)=1,097 ×10^7 ×4 x(1/4-1/16)"
  s = s.replace(
    /1\/lambda\s*=\s*R\s*Z\^2\s*\(\s*1\/n1\^2\s*-\s*1\/n2\^2\s*\)\s*=\s*(\d+(?:[.,]\d+)?)\s*(?:×|x|\*)\s*10\^([-+]?\d+)\s*(?:×|x|\*)\s*(\d+)\s*(?:×|x|\*)\s*\(\s*(\d+)\/(\d+)\s*-\s*(\d+)\/(\d+)\s*\)/gi,
    (_, rVal, rExp, mult, f1n, f1d, f2n, f2d) => {
      const rFormatted = rVal.replace(",", "{,}");
      return ` $\\frac{1}{\\lambda} = R Z^2 \\left( \\frac{1}{n_1^2} - \\frac{1}{n_2^2} \\right) = ${rFormatted} \\times 10^{${rExp}} \\times ${mult} \\times \\left( \\frac{${f1n}}{${f1d}} - \\frac{${f2n}}{${f2d}} \\right)$ `;
    }
  );
  s = s.replace(
    /1\/lambda\s*=\s*R\s*Z\^2\s*\(\s*1\/n1\^2\s*-\s*1\/n2\^2\s*\)/gi,
    () => " $\\frac{1}{\\lambda} = R Z^2 \\left( \\frac{1}{n_1^2} - \\frac{1}{n_2^2} \\right)$ "
  );
  s = s.replace(/(?<![\\$a-zA-Z])1\/lambda\b/gi, () => "$\\frac{1}{\\lambda}$");
  s = s.replace(/(?<![\\$a-zA-Z])\blambda\b(?![\\$a-zA-Z])/gi, () => "$\\lambda$");

  // 0d. Scientific notation, assignments, and units:
  // e.g. "1,215 ×10^-7 m=121,5 nm"
  s = s.replace(
    /(\d+(?:[.,]\d+)?)\s*(?:×|x|\*)\s*10\^([-+]?\d+)\s*([a-zA-Z/]+(?:-?\d+)?)\s*=\s*(\d+(?:[.,]\d+)?)\s*([a-zA-Z]+)/g,
    (_, n1, p1, u1, n2, u2) => {
      const num1 = n1.replace(",", "{,}");
      const num2 = n2.replace(",", "{,}");
      const unit1 = formatUnit(u1);
      const unit2 = formatUnit(u2);
      return ` $${num1} \\times 10^{${p1}}${unit1} = ${num2}${unit2}$ `;
    }
  );
  // Variable assignments: e.g. "R=1,097 × 10^7 m-1", "c=3,00 × 10^8 m/s"
  s = s.replace(
    /(?<![\\$a-zA-Z0-9])\b([a-zA-Z])\s*=\s*(\d+(?:[.,]\d+)?)\s*(?:×|x|\*)\s*10\^([-+]?\d+)(?:\s*([a-zA-Z/]+(?:-?\d+)?))?/g,
    (_, v, num, p, u) => {
      const n = num.replace(",", "{,}");
      const unit = u ? formatUnit(u) : "";
      return ` $${v} = ${n} \\times 10^{${p}}${unit}$ `;
    }
  );
  // Standalone scientific notation: e.g. "5,00 × 10^14 Hz", "1,215 × 10^-7 m"
  s = s.replace(
    /(?<![\\$a-zA-Z0-9])(\d+(?:[.,]\d+)?)\s*(?:×|x|\*)\s*10\^([-+]?\d+)(?:\s*([a-zA-Z/]+(?:-?\d+)?))?(?![\\$a-zA-Z0-9])/g,
    (_, num, p, u) => {
      const n = num.replace(",", "{,}");
      const unit = u ? formatUnit(u) : "";
      return ` $${n} \\times 10^{${p}}${unit}$ `;
    }
  );
  // Standalone powers of 10: "10^7", "10^14", "10^-7"
  s = s.replace(
    /(?<![\\$a-zA-Z0-9])10\^([-+]?\d+)(?![\\$a-zA-Z0-9])/g,
    (_, p) => ` $10^{${p}}$ `
  );

  // 0e. Quantum subscripts & variable subscripts:
  // e.g. "n2=4", "n1=2", "n1^2", "n2^2", "RZ^2"
  s = s.replace(
    /(?<![\\$a-zA-Z0-9])\b([a-zA-Z])(\d+)\s*=\s*([0-9a-zA-Z]+)\b(?![\\$a-zA-Z0-9])/g,
    (_, v, sub, val) => ` $${v}_${sub} = ${val}$ `
  );
  s = s.replace(
    /(?<![\\$a-zA-Z0-9])\b([a-zA-Z])(\d+)\^(\d+)\b(?![\\$a-zA-Z0-9])/g,
    (_, v, sub, pow) => ` $${v}_${sub}^{${pow}}$ `
  );
  s = s.replace(/(?<![\\$a-zA-Z0-9])\bRZ\^2\b(?![\\$a-zA-Z0-9])/g, () => " $R Z^2$ ");

  // 0f. Number with units (e.g. "121,5 nm", "121.5 nm"):
  s = s.replace(
    /(?<![\\$a-zA-Z0-9])(\d+(?:[.,]\d+)?)\s*(nm|m|cm|mm|km|s|ms|Hz|kHz|MHz|GHz|J|kJ|eV|mol|kg|g)(?![\\$a-zA-Z0-9])/g,
    (_, n, u) => {
      const num = n.replace(",", "{,}");
      return ` $${num}\\text{ ${u}}$ `;
    }
  );

  // 0. Bare LaTeX limit expressions: \lim_{...} f(x) = L or \lim_{x \to c} f(x)
  s = s.replace(
    /(?<!\$)\\lim(?:_[a-zA-Z0-9]+|_{[^}]+})(?:\s*[fghP]\([a-zA-Z0-9^()+\-*/]+\)|\s*\([a-zA-Z0-9^()+\-*/\s]+\)|\s*[a-zA-Z0-9])?(?:\s*=\s*[-+*/a-zA-Z0-9]+)?(?!\$)/g,
    (match) => ` $${match.trim()}$ `
  );
  // Bare LaTeX commands like \frac{...}{...}, \sqrt{...}, \mathbb{R}, etc., with balanced braces and nested command support
  s = normalizeBareLatexCommands(s);

  // 1. Spelled out quadratic formula & variations
  s = s.replace(
    /x\s*=\s*\(\s*-b\s+(?:plus\s+atau\s+minus|\+-|\+\/-)\s+akar\s+D\s*\)\s*\/\s*\(\s*2a\s*\)/gi,
    () => " $x = \\frac{-b \\pm \\sqrt{D}}{2a}$ "
  );
  s = s.replace(
    /x\s*=\s*(?:plus\s+atau\s+minus|\+-)\s*sqrt\(([^)]+)\)/gi,
    (_, inner) => ` $x = \\pm\\sqrt{${inner}}$ `
  );
  s = s.replace(
    /y\s*=\s*(?:plus\s+atau\s+minus|\+-)\s*(?:\((b\/a)\)|b\/a)\s*x/gi,
    () => " $y = \\pm\\frac{b}{a}x$ "
  );

  // 2. Trigonometry & angle conversions
  s = s.replace(
    /2\s*pi\s*radian\s*=\s*360\s*derajat\s*\(\s*pi\s*rad\s*=\s*180\s*derajat\s*\)/gi,
    () => " $2\\pi\\text{ rad} = 360^\\circ$ ($\\pi\\text{ rad} = 180^\\circ$)"
  );
  s = s.replace(/(?<!\\)\b2\s*pi\s*rad(?:ian)?\b/gi, () => "$2\\pi\\text{ rad}$");
  s = s.replace(/(?<!\\)\bpi\s*rad(?:ian)?\b/gi, () => "$\\pi\\text{ rad}$");

  // 3. Spelled out root phrases
  s = s.replace(/(?<!\\)\bakar\s+D\b/gi, () => "$\\sqrt{D}$");
  s = s.replace(/(?<!\\)\bplus\s+atau\s+minus\b/gi, () => "$\\pm$");

  // 4. Rational function assignments: f(x) = (expr)/(expr)
  s = s.replace(
    /\b([fghP]\([a-zA-Z0-9]+\))\s*=\s*\(([^)]+)\)\s*\/\s*\(([^)]+)\)/g,
    (_, fn, num, den) => ` $${fn} = \\frac{${num}}{${den}}$ `
  );

  // 5. Rational & reciprocal graphs: f(x) = 1/x, g(x) = 1/x^2
  s = s.replace(/(?<!\\)\b([fghP]\([a-zA-Z0-9]+\)\s*=\s*)?1\/x\^2\b/g, (match, prefix) => {
    return prefix ? `$${prefix}\\frac{1}{x^2}$` : "$\\frac{1}{x^2}$";
  });
  s = s.replace(/(?<!\\)\b([fghP]\([a-zA-Z0-9]+\)\s*=\s*)?1\/x\b/g, (match, prefix) => {
    return prefix ? `$${prefix}\\frac{1}{x}$` : "$\\frac{1}{x}$";
  });

  // 6. Simple function assignments: f(x) = ax + b, f(x) = 2x - 3
  s = s.replace(
    /\b([fghP]\([a-zA-Z0-9]+\))\s*=\s*([a-zA-Z0-9]+(?:\s*[-+*/^]\s*[a-zA-Z0-9]+)+)(?=[,.;]|\s+(?:dan|atau|untuk|di|jika|maka|dengan)\b|$)/g,
    (_, fn, rhs) => ` $${fn} = ${rhs.trim()}$ `
  );

  // 7. Multi-term geometric equations (Circle, Ellipse, Hyperbola, Distance)
  s = s.replace(
    /\(\s*x\s*-\s*p\s*\)\^2\s*\+\s*\(\s*y\s*-\s*q\s*\)\^2\s*=\s*r\^2/g,
    () => " $(x - p)^2 + (y - q)^2 = r^2$ "
  );
  s = s.replace(
    /\(\s*x\s*-\s*p\s*\)\^2\s*\/\s*a\^2\s*\+\s*\(\s*y\s*-\s*q\s*\)\^2\s*\/\s*b\^2\s*=\s*1/g,
    () => " $\\frac{(x - p)^2}{a^2} + \\frac{(y - q)^2}{b^2} = 1$ "
  );
  s = s.replace(
    /x\^2\s*\/\s*a\^2\s*-\s*y\^2\s*\/\s*b\^2\s*=\s*1/g,
    () => " $\\frac{x^2}{a^2} - \\frac{y^2}{b^2} = 1$ "
  );
  s = s.replace(
    /\bx\^2\s*\+\s*y\^2\s*=\s*r\^2\b/g,
    () => " $x^2 + y^2 = r^2$ "
  );

  // 8. Pythagorean trigonometric identities
  s = s.replace(
    /sin\^2\(theta\)\s*\+\s*cos\^2\(theta\)\s*=\s*1/gi,
    () => " $\\sin^2\\theta + \\cos^2\\theta = 1$ "
  );
  s = s.replace(
    /1\s*\+\s*tan\^2\(theta\)\s*=\s*sec\^2\(theta\)/gi,
    () => " $1 + \\tan^2\\theta = \\sec^2\\theta$ "
  );
  s = s.replace(
    /1\s*\+\s*cot\^2\(theta\)\s*=\s*csc\^2\(theta\)/gi,
    () => " $1 + \\cot^2\\theta = \\csc^2\\theta$ "
  );
  s = s.replace(
    /cos\(2\*theta\)\s*=\s*cos\^2\(theta\)\s*-\s*sin\^2\(theta\)/gi,
    () => " $\\cos(2\\theta) = \\cos^2\\theta - \\sin^2\\theta$ "
  );

  // 9. Theta formulas BEFORE individual theta
  s = s.replace(/(?<!\\)\btheta\s*=\s*s\/r\b/gi, () => "$\\theta = \\frac{s}{r}$");
  s = s.replace(/(?<!\\)\b([a-zA-Z]+)\(theta\)/gi, (_, fn) => `$\\${fn}(\\theta)$`);
  s = s.replace(/(?<!\\)\b(?:sudut\s+)?theta\b/gi, (match) => {
    return match.toLowerCase().startsWith("sudut") ? "sudut $\\theta$" : "$\\theta$";
  });

  // 10. sqrt(...) expressions: sqrt(x), sqrt(x^2), sqrt((c - a)^2 + (d - b)^2), etc.
  s = s.replace(/(?<!\\)\bsqrt\(([^)]+)\)/g, (_, inner) => {
    return `$\\sqrt{${inner}}$`;
  });

  // 11. Single-variable power equations like a^2=x, x^2=b
  s = s.replace(/(?<!\\)\b([a-zA-Z])\^2\s*=\s*([a-zA-Z0-9]+)(?!\^)\b/g, (_, v, res) => {
    return `$${v}^2 = ${res}$`;
  });
  s = s.replace(/(?<!\\)\bD\s*=\s*b\^2\s*-\s*4ac\b/g, () => "$D = b^2 - 4ac$");
  s = s.replace(/(?<!\\)\b([a-zA-Z])\(r\)\s*=\s*0\b/g, (_, fn) => `$${fn}(r) = 0$`);

  // 12. Simple polynomial expressions: ax^2 + bx + c
  s = s.replace(/(?<!\\)\bax\^2\s*\+\s*bx\s*\+\s*c\b/g, () => "$ax^2 + bx + c$");

  // 13. Rational powers: x^(1/2), x^(1/3), x^(p/q), y = x^n
  s = s.replace(/(?<!\\)\bx\^\(([0-9a-zA-Z]+)\/([0-9a-zA-Z]+)\)/g, (_, n, d) => `$x^{\\frac{${n}}{${d}}}$`);
  s = s.replace(/(?<!\\)\b([xy])\s*=\s*([a-zA-Z])\^([a-zA-Z0-9]+)\b/g, (_, l, b, p) => `$${l} = ${b}^{${p}}$`);

  // 14. Chain inequalities like 0 < |x - c| < delta or -delta < x - c < 0
  s = s.replace(
    /(?:-?(?:delta|epsilon|[0-9a-zA-Z]+))\s*(?:<|<=|\\le)\s*(?:\|[^|]+\||[-a-zA-Z0-9\s+]+?)\s*(?:<|<=|\\le)\s*(?:delta|epsilon|[0-9a-zA-Z]+)/g,
    (match) => {
      const tex = match.replace(/\bdelta\b/g, "\\delta").replace(/\bepsilon\b/g, "\\epsilon");
      return ` $${tex.trim()}$ `;
    }
  );

  // 15. Greek letter inequalities: epsilon > 0, delta > 0, delta = epsilon / a
  s = s.replace(/\b(delta|epsilon)\s*(>=|<=|!=|>|<)\s*([0-9a-zA-Z]+)/g, (_, greek, op, val) => {
    const texOp = op === ">=" ? "\\ge" : op === "<=" ? "\\le" : op === "!=" ? "\\ne" : op;
    return ` $\\${greek} ${texOp} ${val}$ `;
  });
  s = s.replace(/\b(delta|epsilon)\s*=\s*(delta|epsilon)\s*\/\s*([0-9a-zA-Z]+)/g, (_, g1, g2, denom) => {
    return ` $\\${g1} = \\frac{\\${g2}}{${denom}}$ `;
  });

  // 16. Standalone function evaluations: f(c), f(x), f(1), f(0), g(x)
  s = s.replace(
    /(?<![\\$a-zA-Z0-9])\b([fghP]\([a-zA-Z0-9+\\-]+\))(?![\\$a-zA-Z0-9])/g,
    (match) => ` $${match}$ `
  );

  // 17. Single-variable assignments in sentences: di x=c, di x=1, x=0
  s = s.replace(
    /(?<![\\$a-zA-Z0-9])\b([a-zA-Z])\s*=\s*([a-zA-Z0-9]+)\b(?![\\$a-zA-Z0-9])/g,
    (_, v, val) => ` $${v} = ${val}$ `
  );

  // 18. Inequalities: e.g. x >= 0, a >= 0, r > 0, k > 0, n >= 3, c > 1, p > 0, b != 0, -1 < x < 1, |x| > 1, x < c, x > c
  s = s.replace(
    /(?<!\\)\b(-?[0-9]+)\s*<\s*([a-zA-Z])\s*<\s*(-?[0-9]+)\b/g,
    (_, min, v, max) => `$${min} < ${v} < ${max}$`
  );
  s = s.replace(
    /\|([a-zA-Z])\|\s*(>=|<=|>|<)\s*([0-9]+)\b/g,
    (_, v, op, val) => {
      const texOp = op === ">=" ? "\\ge" : op === "<=" ? "\\le" : op === "!=" ? "\\ne" : op;
      return `$|${v}| ${texOp} ${val}$`;
    }
  );
  s = s.replace(
    /(?<![\\$])\b([a-zA-Z](?:[0-9]+)?)\s*(>=|<=|!=|>|<)\s*(-?[0-9a-zA-Z]+)\b(?![\\$])/g,
    (_, v, op, val) => {
      const texOp =
        op === ">=" ? "\\ge" : op === "<=" ? "\\le" : op === "!=" ? "\\ne" : op;
      return ` $${v} ${texOp} ${val}$ `;
    }
  );

  // 19. Absolute values: |x| = x, |x| = -x, |-a| = |a|, |ab| = |a||b|, |a + b| <= |a| + |b|
  s = s.replace(/\|x\|\s*=\s*x\b/g, () => "$|x| = x$");
  s = s.replace(/\|x\|\s*=\s*-x\b/g, () => "$|x| = -x$");
  s = s.replace(/\|-a\|\s*=\s*\|a\|/g, () => "$|-a| = |a|$");
  s = s.replace(/\|ab\|\s*=\s*\|a\|\|b\|/g, () => "$|ab| = |a||b|$");
  s = s.replace(/\|a\s*\+\s*b\|\s*<=\s*\|a\|\s*\+\s*\|b\|/g, () => "$|a + b| \\le |a| + |b|$");

  // 20. Double inequalities: |x| <= a <=> -a <= x <= a
  s = s.replace(
    /\|x\|\s*<=\s*a\s*<=>\s*-a\s*<=\s*x\s*<=\s*a/g,
    () => "$|x| \\le a \\Leftrightarrow -a \\le x \\le a$"
  );
  s = s.replace(
    /\|x\|\s*>=\s*a\s*<=>\s*x\s*<=\s*-a\s+atau\s+x\s*>=\s*a/g,
    () => "$|x| \\ge a \\Leftrightarrow x \\le -a \\text{ atau } x \\ge a$"
  );

  // 21. Logical equivalence <=> and implication =>
  s = s.replace(/\s*<=>\s*/g, () => " $\\Leftrightarrow$ ");
  s = s.replace(/\s*=>\s*/g, () => " $\\Rightarrow$ ");

  // 22. Center point (p,q) and (0,0) in geometric equations
  s = s.replace(/(?<!\\)\bpusat\s*\(\s*p\s*,\s*q\s*\)/gi, () => "pusat $(p,q)$");
  s = s.replace(/(?<!\\)\bpusat\s*\(\s*0\s*,\s*0\s*\)/gi, () => "pusat $(0,0)$");

  // 23. Sets: HP = HP1 cap HP2
  s = s.replace(/(?<!\\)\bHP\s*=\s*HP1\s*cap\s*HP2\b/g, () => "$\\text{HP} = \\text{HP}_1 \\cap \\text{HP}_2$");

  // Normalize duplicate spaces while preserving outer whitespace
  const leadingSpaces = s.match(/^\s*/)?.[0] || "";
  const trailingSpaces = s.match(/\s*$/)?.[0] || "";
  s = leadingSpaces + s.trim().replace(/[ \t]{2,}/g, " ") + trailingSpaces;

  return s;
}

/**
 * Main export: normalizes mixed prose so that all mathematical expressions are properly
 * delimited for KaTeX parsing while leaving pre-existing math segments untouched.
 */
export function normalizeMathInText(input: string | null | undefined): string {
  if (!input) return "";

  // If the input doesn't contain any delimiters or backticks, normalize directly
  if (!input.includes("$") && !input.includes("\\[") && !input.includes("\\(") && !input.includes("`")) {
    return normalizePlainTextSegment(input);
  }

  // Tokenize around existing math delimiters and backticks to ensure we don't double-process already-delimited math
  const tokens: string[] = [];
  let cursor = 0;

  while (cursor < input.length) {
    const startsDisplayDollar = input.startsWith("$$", cursor);
    const startsInlineDollar = input[cursor] === "$" && !startsDisplayDollar;
    const startsDisplayBracket = input.startsWith("\\[", cursor);
    const startsInlineParen = input.startsWith("\\(", cursor);
    const startsBacktick = input[cursor] === "`";

    if (startsDisplayDollar || startsInlineDollar || startsDisplayBracket || startsInlineParen) {
      const open = startsDisplayDollar ? "$$" : startsInlineDollar ? "$" : startsDisplayBracket ? "\\[" : "\\(";
      const close = startsDisplayDollar ? "$$" : startsInlineDollar ? "$" : startsDisplayBracket ? "\\]" : "\\)";

      const closeIdx = input.indexOf(close, cursor + open.length);
      if (closeIdx !== -1) {
        if (cursor > 0) {
          tokens.push(normalizePlainTextSegment(input.slice(0, cursor)));
        }
        tokens.push(input.slice(cursor, closeIdx + close.length));
        const rest = input.slice(closeIdx + close.length);
        return tokens.join("") + normalizeMathInText(rest);
      }
    } else if (startsBacktick) {
      const closeIdx = input.indexOf("`", cursor + 1);
      if (closeIdx !== -1) {
        if (cursor > 0) {
          tokens.push(normalizePlainTextSegment(input.slice(0, cursor)));
        }
        tokens.push(input.slice(cursor, closeIdx + 1));
        const rest = input.slice(closeIdx + 1);
        return tokens.join("") + normalizeMathInText(rest);
      }
    }

    cursor++;
  }

  tokens.push(normalizePlainTextSegment(input));
  return tokens.join("");
}
