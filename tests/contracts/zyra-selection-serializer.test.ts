import { describe, expect, test } from "bun:test";
import {
  sanitizeKatexInHtml,
  normalizeCleanMathText,
  determineSuggestedIntent,
} from "@/lib/zyra/selection-serializer";

describe("Zyra Selection Serializer Contracts", () => {
  test("normalizes whitespace and LaTeX delimiters cleanly", () => {
    const raw = "  Untuk   $ P(x) = x^2 - 5x + 6 $ ,   tentukan akar   ";
    const cleaned = normalizeCleanMathText(raw);
    expect(cleaned).toBe("Untuk $P(x) = x^2 - 5x + 6$, tentukan akar");
  });

  test("determines suggested intent based on word count, math, and block type", () => {
    // 1-3 words: definition intent
    expect(determineSuggestedIntent("Diskriminan", false, 1)).toBe("define");
    expect(determineSuggestedIntent("Faktor linear", false, 2)).toBe("define");

    // Math equation step or worked example: step by step
    expect(
      determineSuggestedIntent("D = (-5)^2 - 4(1)(6) = 1 > 0", true, 6, "worked_example")
    ).toBe("step_by_step");

    // Conceptual statements / long paragraphs: intuition
    expect(
      determineSuggestedIntent(
        "Polinom pangkat empat ditambah satu tidak memiliki akar real pada bidang Kartesius.",
        false,
        11,
        "explanation"
      )
    ).toBe("intuition");
  });

  test("replaces KaTeX HTML structure with single LaTeX formula, eliminating duplicate MathML and HTML spans", () => {
    const katexHtml = `
      <p>
        Untuk
        <span class="katex">
          <span class="katex-mathml">
            <math xmlns="http://www.w3.org/1999/xhtml">
              <semantics>
                <mrow><mi>P</mi><mo stretchy="false">(</mo><mi>x</mi><mo stretchy="false">)</mo></mrow>
                <annotation encoding="application/x-tex">P(x) = x^2 - 5x + 6</annotation>
              </semantics>
            </math>
          </span>
          <span class="katex-html" aria-hidden="true">
            <span class="base">
              <span class="mord mathnormal">P</span>
              <span class="mopen">(</span>
              <span class="mord mathnormal">x</span>
              <span class="mclose">)</span>
              <span class="mspace"></span>
              <span class="mrel">=</span>
            </span>
          </span>
        </span>
        tentukan faktor.
      </p>
    `;

    const text = sanitizeKatexInHtml(katexHtml);
    expect(text).toBe("Untuk $P(x) = x^2 - 5x + 6$ tentukan faktor.");
    // Crucially: no duplicated "P ( x ) = x 2 − 5 x + 6 P(x)=x 2 −5x+6"
    expect(text).not.toContain("P ( x ) =");
  });
});

