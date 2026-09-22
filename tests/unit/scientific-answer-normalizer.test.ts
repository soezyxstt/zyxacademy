import { describe, it, expect } from "bun:test";
import katex from "katex";
import {
  checkBracketBalance,
  scientificTextToLatex,
  canonicalizeScientificAnswer,
  validateAndNormalizeScientificAnswer,
} from "@/lib/math/scientific-answer-normalizer";

describe("scientific-answer-normalizer", () => {
  describe("checkBracketBalance", () => {
    it("detects balanced brackets correctly", () => {
      expect(checkBracketBalance("x^2 + 3").balanced).toBe(true);
      expect(checkBracketBalance("x^{2} + \\frac{1}{2}").balanced).toBe(true);
      expect(checkBracketBalance("[a + (b - c)]").balanced).toBe(true);
    });

    it("detects unclosed curly brace", () => {
      const res = checkBracketBalance("x^{2 + 3");
      expect(res.balanced).toBe(false);
      expect(res.error).toContain("Kurung kurawal");
    });

    it("detects unclosed parenthesis", () => {
      const res = checkBracketBalance("(a + b");
      expect(res.balanced).toBe(false);
      expect(res.error).toContain("Kurung buka");
    });

    it("detects mismatched closing bracket", () => {
      const res = checkBracketBalance("(a + b]");
      expect(res.balanced).toBe(false);
      expect(res.error).toContain("Tanda kurung penutup");
    });
  });

  describe("scientificTextToLatex", () => {
    it("converts powers, roots, and fractions shortcuts to valid KaTeX", () => {
      const res = scientificTextToLatex("sqrt(x) + x^2 - 1/2");
      expect(res).toContain("\\sqrt{x}");
      expect(res).toContain("x^2");
    });

    it("converts Greek letters and degrees", () => {
      const res = scientificTextToLatex("theta = 45°");
      expect(res).toContain("\\theta");
      expect(res).toContain("^\\circ");
      expect(() => katex.renderToString(res, { throwOnError: true })).not.toThrow();
    });

    it("converts powers of 10 and scientific notation", () => {
      const res = scientificTextToLatex("1.5 * 10^-3 m/s");
      expect(res).toContain("10^{-3}");
    });

    it("converts chemical reactions and auto-subscripts", () => {
      const res = scientificTextToLatex("Ca2+ + 2OH- -> Ca(OH)2");
      expect(res).toContain("\\rightarrow");
      expect(res).toContain("Ca(OH)_2");
    });
  });

  describe("canonicalizeScientificAnswer", () => {
    it("standardizes equivalent representations", () => {
      expect(canonicalizeScientificAnswer("x^2 + 3x")).toBe("x^2 + 3x");
      expect(canonicalizeScientificAnswer("x^{2} + 3x")).toBe("x^2 + 3x");
      expect(canonicalizeScientificAnswer("+-5")).toBe("± 5");
      expect(canonicalizeScientificAnswer("\\pm 5")).toBe("± 5");
      expect(canonicalizeScientificAnswer("H2O")).toBe("h2o");
    });
  });

  describe("validateAndNormalizeScientificAnswer", () => {
    it("returns invalid result with error on broken syntax", () => {
      const res = validateAndNormalizeScientificAnswer("x^{2");
      expect(res.isValid).toBe(false);
      expect(res.error).toBeDefined();
    });

    it("returns valid result with KaTeX and normalized string on clean syntax", () => {
      const res = validateAndNormalizeScientificAnswer("3x^2 - 8x");
      expect(res.isValid).toBe(true);
      expect(res.latex).toBe("3x^2 - 8x");
      expect(res.normalized).toBe("3x^2 - 8x");
    });
  });
});
