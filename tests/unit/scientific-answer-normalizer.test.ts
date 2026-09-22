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

    it("converts powers of 10 and scientific notation with upright units", () => {
      const res = scientificTextToLatex("1.5 * 10^-3 m/s");
      expect(res).toContain("10^{-3}");
      expect(res).toContain("\\text{ m/s}");
      expect(() => katex.renderToString(res, { throwOnError: true })).not.toThrow();

      const resKg = scientificTextToLatex("50 kg");
      expect(resKg).toContain("\\text{ kg}");
      expect(() => katex.renderToString(resKg, { throwOnError: true })).not.toThrow();

      const resNm = scientificTextToLatex("121.5 nm");
      expect(resNm).toContain("\\text{ nm}");
      expect(() => katex.renderToString(resNm, { throwOnError: true })).not.toThrow();
    });

    it("converts complete set of Greek letters including uppercase", () => {
      const res = scientificTextToLatex("psi + chi = kappa");
      expect(res).toContain("\\psi");
      expect(res).toContain("\\chi");
      expect(res).toContain("\\kappa");

      const resUpper = scientificTextToLatex("Gamma + Psi");
      expect(resUpper).toContain("\\Gamma");
      expect(resUpper).toContain("\\Psi");
      expect(() => katex.renderToString(resUpper, { throwOnError: true })).not.toThrow();
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
