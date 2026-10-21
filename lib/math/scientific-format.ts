function scientificParts(value: number): { coefficient: string; exponent: number } {
  const [coefficient, exponent] = value.toExponential(3).split("e");
  return { coefficient: coefficient.replace(/\.?0+$/, ""), exponent: Number(exponent) };
}

/** Literal scientific data can exceed IEEE-754 range; keep its authored precision. */
export function scientificLiteralToLatex(value: string): string | null {
  const match = value.trim().match(/^([+-]?(?:(?:0|[1-9]\d*)(?:\.\d*)?|\.\d+))[eE]([+-]?)(\d+)$/);
  if (!match) return null;
  const digits = match[3].replace(/^0+(?=\d)/, "");
  const exponent = `${match[2] === "-" && digits !== "0" ? "-" : ""}${digits}`;
  return `${match[1]}\\times 10^{${exponent}}`;
}

export function scientificValueToMathText(value: string | number): string {
  const latex = typeof value === "number" ? scientificNumberToLatex(value) : scientificLiteralToLatex(value);
  return latex === null ? String(value) : `$${latex}$`;
}

/** Four significant digits, preserving nonzero values at every finite magnitude. */
export function scientificNumberToLatex(value: number): string {
  if (Number.isNaN(value)) return "\\text{tidak terdefinisi}";
  if (!Number.isFinite(value)) return value < 0 ? "-\\infty" : "\\infty";
  if (value === 0) return "0";
  const { coefficient, exponent } = scientificParts(value);
  return exponent < -3 || exponent >= 4
    ? `${coefficient}\\times 10^{${exponent}}`
    : String(Number(value.toPrecision(4)));
}

export function scientificNumberToText(value: number): string {
  if (Number.isNaN(value)) return "tidak terdefinisi";
  if (!Number.isFinite(value)) return value < 0 ? "-∞" : "∞";
  if (value === 0) return "0";
  const { coefficient, exponent } = scientificParts(value);
  const superscripts: Record<string, string> = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
  return exponent < -3 || exponent >= 4
    ? `${coefficient} × 10${String(exponent).split("").map((digit) => superscripts[digit]).join("")}`
    : String(Number(value.toPrecision(4)));
}
