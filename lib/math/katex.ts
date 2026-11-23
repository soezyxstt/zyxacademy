import katex, { type KatexOptions } from "katex";
import "katex/contrib/mhchem";

/**
 * Common university math, physics, and statistics operators not built into KaTeX.
 * Merged beneath caller macros so explicit overrides still win.
 */
const DEFAULT_MATH_MACROS: Record<string, string> = {
  "\\Log": "\\operatorname{Log}",
  "\\Arg": "\\operatorname{Arg}",
  "\\Res": "\\operatorname{Res}",
  "\\sgn": "\\operatorname{sgn}",
  "\\sech": "\\operatorname{sech}",
  "\\csch": "\\operatorname{csch}",
  "\\arccot": "\\operatorname{arccot}",
  "\\arcsec": "\\operatorname{arcsec}",
  "\\arccsc": "\\operatorname{arccsc}",
  "\\arcsinh": "\\operatorname{arcsinh}",
  "\\arccosh": "\\operatorname{arccosh}",
  "\\arctanh": "\\operatorname{arctanh}",
  "\\lcm": "\\operatorname{lcm}",
  "\\tr": "\\operatorname{tr}",
  "\\rank": "\\operatorname{rank}",
  "\\diag": "\\operatorname{diag}",
  "\\Var": "\\operatorname{Var}",
  "\\Cov": "\\operatorname{Cov}",
  "\\Corr": "\\operatorname{Corr}",
  "\\erf": "\\operatorname{erf}",
  "\\erfc": "\\operatorname{erfc}",
  "\\cis": "\\operatorname{cis}",
  "\\sinc": "\\operatorname{sinc}",
  "\\proj": "\\operatorname{proj}",
  "\\R": "\\mathbb{R}",
  "\\N": "\\mathbb{N}",
  "\\Z": "\\mathbb{Z}",
  "\\Q": "\\mathbb{Q}",
  "\\C": "\\mathbb{C}",
};

/** Keep chemistry support and the untrusted-content boundary identical across renderers. */
const scientificKatex = {
  renderToString(expression: string, options: KatexOptions = {}): string {
    const macros = options.macros
      ? { ...DEFAULT_MATH_MACROS, ...options.macros }
      : { ...DEFAULT_MATH_MACROS };
    return katex.renderToString(expression, { ...options, macros, trust: false });
  },
};

export default scientificKatex;
