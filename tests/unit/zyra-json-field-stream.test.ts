import { describe, expect, test } from "bun:test";
import { JsonFieldStreamExtractor } from "@/lib/zyra/json-field-stream";
import { FOLLOWUPS_CLOSE, FOLLOWUPS_OPEN } from "@/lib/zyra/followups";

describe("JsonFieldStreamExtractor", () => {
  test("streams learnerFacingText incrementally even when split character by character", () => {
    const deltas: string[] = [];
    const extractor = new JsonFieldStreamExtractor(["learnerFacingText", "answer"], (delta) => {
      deltas.push(delta);
    });

    const payload = JSON.stringify({
      selectedState: "explain",
      teachingMove: "explain_concept",
      hintLevel: "none",
      learnerFacingText: "Line 1\nUse $\\Log z$ and \"quotes\" here.\\nDone.",
      citations: [{ sourceId: "src-1", sourceVersion: 1, claim: "nested \"answer\": \"ignored\"" }],
    });

    for (const ch of payload) {
      extractor.push(ch);
    }

    expect(extractor.hasEmitted).toBe(true);
    expect(deltas.length).toBeGreaterThan(5);
    expect(extractor.emittedText).toBe("Line 1\nUse $\\Log z$ and \"quotes\" here.\\nDone.");
  });

  test("suppresses legacy <zyra-followups> metadata during live streaming", () => {
    const deltas: string[] = [];
    const extractor = new JsonFieldStreamExtractor(["answer"], (delta) => {
      deltas.push(delta);
    });

    const followupJson = JSON.stringify([
      { label: "Contoh lain", prompt: "Beri contoh lain.", icon: "example", intent: "practice" },
    ]);
    const payload = JSON.stringify({
      covered: true,
      answer: `Penjelasan singkat.${FOLLOWUPS_OPEN}${followupJson}${FOLLOWUPS_CLOSE}`,
    });

    for (let i = 0; i < payload.length; i += 3) {
      extractor.push(payload.slice(i, i + 3));
    }

    expect(extractor.emittedText).toBe("Penjelasan singkat.");
    expect(deltas.join("")).toBe("Penjelasan singkat.");
  });

  test("decodes unicode escapes and ignores unrelated classifier JSON", () => {
    const deltas: string[] = [];
    const extractor = new JsonFieldStreamExtractor(["learnerFacingText", "answer"], (delta) => {
      deltas.push(delta);
    });

    // Classifier JSON has no target key
    extractor.push(JSON.stringify({ action: "retrieve", contentFocus: "logaritma kompleks" }));
    expect(extractor.hasEmitted).toBe(false);

    const unicodeExtractor = new JsonFieldStreamExtractor(["answer"], (delta) => {
      deltas.push(delta);
    });
    unicodeExtractor.push('{"covered":true,"answer":"Halo \\u03c0"}');
    expect(unicodeExtractor.emittedText).toBe("Halo \u03c0");
  });
});
