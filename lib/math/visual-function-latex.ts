import type { VisualFunctionModel } from "@/lib/materials/visual-contract";

export function visualFunctionToLatex(model: VisualFunctionModel): string {
  const terms = model.kind === "quadratic" ? [[model.a, 2], [model.b, 1], [model.c, 0]]
    : model.kind === "linear" ? [[model.m, 1], [model.b, 0]] : [[model.c, 0]];
  const rendered = terms.filter(([coefficient]) => coefficient !== 0).map(([coefficient, power], index) => {
    const sign = coefficient < 0 ? "-" : index > 0 ? "+" : "";
    const magnitude = Math.abs(coefficient);
    const [coefficientText, exponent] = magnitude.toExponential().split("e");
    const exact = magnitude < 0.001 || magnitude >= 10000 ? `${coefficientText}\\times10^{${Number(exponent)}}` : String(magnitude);
    const scalar = power > 0 && magnitude === 1 ? "" : exact;
    return `${sign}${scalar}${power === 2 ? "x^2" : power === 1 ? "x" : ""}`;
  }).join("");
  return `f(x)=${rendered || "0"}`;
}
