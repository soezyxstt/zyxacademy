import { expect, test } from "bun:test";
import { scientificLiteralToLatex, scientificValueToMathText } from "@/lib/math/scientific-format";

test("scientific literal formatting preserves exact coefficients beyond IEEE-754 range", () => {
  expect(scientificLiteralToLatex("1.700e-999")).toBe(String.raw`1.700\times 10^{-999}`);
  expect(scientificLiteralToLatex("1.7e+999")).toBe(String.raw`1.7\times 10^{999}`);
  expect(scientificLiteralToLatex(".5e-1")).toBe(String.raw`.5\times 10^{-1}`);
  expect(scientificLiteralToLatex("1.234567890123456789e-00005")).toBe(String.raw`1.234567890123456789\times 10^{-5}`);
  expect(scientificLiteralToLatex("1e-0000")).toBe(String.raw`1\times 10^{0}`);
  for (const value of ["001e3", "ID-1.7e-5", "$1e-5$", "1e-5 kg"]) expect(scientificLiteralToLatex(value)).toBeNull();
  expect(scientificValueToMathText("1.700e-999")).toBe(String.raw`$1.700\times 10^{-999}$`);
  expect(scientificValueToMathText("ID-1.7e-5")).toBe("ID-1.7e-5");
  expect(scientificValueToMathText(0.000017)).toBe(String.raw`$1.7\times 10^{-5}$`);
});
