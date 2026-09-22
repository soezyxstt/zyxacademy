import { describe, it, expect } from "bun:test";
import {
  normalizeShortAnswer,
  isShortAnswerCorrect,
  deduplicateAcceptableAnswers,
} from "@/lib/quiz/short-answer";

describe("Short Answer Normalization and Evaluation", () => {
  it("normalizes and matches the user's chemistry equation example", () => {
    // Student submitted:
    const submitted = "Mg (g) -> Mg (g)^+ + e^-";

    // DB acceptable answers list:
    const acceptable = [
      "Mg_{(g)} -> Mg_{(g)}^+ + e^-",
      "Mg_{(g)} \\to Mg_{(g)}^+ + e^-",
      "Mg_{(g)} -> Mg_{(g)}^+ + e",
      "Mg_{(g)} -> Mg_{(g)}^+ +e",
    ];

    expect(isShortAnswerCorrect(submitted, acceptable)).toBe(true);
  });

  it("handles variations in arrow types, spacing, and LaTeX syntax in chemistry", () => {
    // Various ways students or authors write arrows and subscripts
    const variants = [
      "Mg(g) -> Mg(g)^+ + e^-",
      "Mg (g) --> Mg (g)^+ + e^-",
      "Mg(g) \\rightarrow Mg(g)^+ + e^-",
      "Mg_{(g)} \\to Mg_{(g)}^+ + e^-",
      "Mg (g) → Mg (g)⁺ + e⁻",
    ];

    for (const v1 of variants) {
      for (const v2 of variants) {
        expect(isShortAnswerCorrect(v1, [v2])).toBe(true);
      }
    }
  });

  it("handles stoichiometric coefficients and states of matter", () => {
    const studentAnswer = "2 H2(g) + O2 (g) -> 2 H2O (l)";
    const keyAnswer = "2H2_{(g)} + O2_{(g)} \\to 2H2O_{(l)}";
    expect(isShortAnswerCorrect(studentAnswer, [keyAnswer])).toBe(true);
  });

  it("handles ion charges with superscripts and unicode", () => {
    const studentAnswer = "Fe^3+ + 3e- -> Fe";
    const keyAnswer = "Fe^{3+} + 3e^- \\to Fe";
    expect(isShortAnswerCorrect(studentAnswer, [keyAnswer])).toBe(true);
  });

  it("handles math equations and expressions", () => {
    expect(isShortAnswerCorrect("x = 5", ["x=5"])).toBe(true);
    expect(isShortAnswerCorrect("y = 2x + 1", ["y=2x+1"])).toBe(true);
    expect(isShortAnswerCorrect("1 / 2", ["1/2"])).toBe(true);
    expect(isShortAnswerCorrect("$x = 5$", ["x = 5"])).toBe(true);
  });

  it("handles Indonesian decimal comma versus dot for numbers and trailing dots", () => {
    expect(isShortAnswerCorrect("12,5", ["12.5"])).toBe(true);
    expect(isShortAnswerCorrect("3,14", ["3.14"])).toBe(true);
    expect(isShortAnswerCorrect("0,05 mol", ["0.05 mol"])).toBe(true);
    expect(isShortAnswerCorrect("5.", ["5"])).toBe(true);
  });

  it("handles reversible arrows without partial match corruption", () => {
    expect(isShortAnswerCorrect("N2 + 3H2 <-> 2NH3", ["N2 + 3H2 \\rightleftharpoons 2NH3"])).toBe(true);
    expect(isShortAnswerCorrect("N2 + 3H2 <=> 2NH3", ["N2 + 3H2 <-> 2NH3"])).toBe(true);
  });

  it("handles structured object submissions with text field", () => {
    expect(isShortAnswerCorrect({ text: "Mg (g) -> Mg (g)^+ + e^-" }, ["Mg_{(g)} -> Mg_{(g)}^+ + e^-"])).toBe(true);
    expect(isShortAnswerCorrect({ text: "5." }, ["5"])).toBe(true);
  });

  it("handles plain text terms with case-insensitivity and trailing punctuation", () => {
    expect(isShortAnswerCorrect("Mitokondria.", ["mitokondria"])).toBe(true);
    expect(isShortAnswerCorrect("  Fotosintesis  ", ["fotosintesis"])).toBe(true);
    expect(isShortAnswerCorrect("Reaksi Redoks", ["reaksi redoks"])).toBe(true);
  });

  it("rejects genuinely incorrect answers", () => {
    expect(isShortAnswerCorrect("Mg (g) -> Mg (g)^2+ + 2e^-", ["Mg_{(g)} -> Mg_{(g)}^+ + e^-"])).toBe(false);
    expect(isShortAnswerCorrect("Ca + Cl -> CaCl2", ["2Na + Cl2 -> 2NaCl"])).toBe(false);
    expect(isShortAnswerCorrect("", ["Mg"])).toBe(false);
    expect(isShortAnswerCorrect("  ", ["Mg"])).toBe(false);
  });

  it("deduplicates acceptable answers effectively", () => {
    const duplicates = [
      "Mg_{(g)} -> Mg_{(g)}^+ + e^-",
      "Mg_{(g)} \\to Mg_{(g)}^+ + e^-",
      "Mg(g) -> Mg(g)^+ + e^-",
      "Mg_{(g)} -> Mg_{(g)}^+ + e",
    ];

    const deduplicated = deduplicateAcceptableAnswers(duplicates);
    // The first three normalize to the exact same formula (→ vs -> and _{(g)} vs (g))
    // The 4th lacks "^-" so it's a distinct variation
    expect(deduplicated.length).toBe(2);
    expect(deduplicated[0]).toBe("Mg_{(g)} -> Mg_{(g)}^+ + e^-");
    expect(deduplicated[1]).toBe("Mg_{(g)} -> Mg_{(g)}^+ + e");
  });
});
