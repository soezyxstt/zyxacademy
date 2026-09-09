import { describe, expect, test } from "bun:test";
import {
  assertCompleteQuestionProvenance,
  normalizeQuestionProvenance,
  questionProvenanceSnapshot,
} from "@/lib/asesmen/question-provenance";

describe("question provenance", () => {
  test("keeps Zyx questions citation-free", () => {
    expect(normalizeQuestionProvenance({ origin: "zyx_original", sourceEventName: "ignored" })).toEqual({
      origin: "zyx_original",
      sourceEventName: null,
      sourceReferenceId: null,
    });
  });

  test("requires a source event and reference for ITB examples", () => {
    expect(() => assertCompleteQuestionProvenance({ origin: "itb_example" })).toThrow("QUESTION_ITB_PROVENANCE_INCOMPLETE");
    expect(questionProvenanceSnapshot({
      origin: "itb_example",
      sourceEventName: " UTS Matematika I ITB 2024 ",
      sourceReferenceId: " ref-itb-2024 ",
    })).toEqual({
      origin: "itb_example",
      sourceEventName: "UTS Matematika I ITB 2024",
      sourceReferenceId: "ref-itb-2024",
    });
  });

  test("requires attribution for historical references", () => {
    expect(() => assertCompleteQuestionProvenance({ origin: "historical_reference" })).toThrow("QUESTION_HISTORICAL_PROVENANCE_INCOMPLETE");
    expect(questionProvenanceSnapshot({
      origin: "historical_reference",
      sourceEventName: "Tutorial Matematika I · ITB · 2023 · Soal 4",
      sourceReferenceId: "assessment-source-2023",
    })).toEqual({
      origin: "historical_reference",
      sourceEventName: "Tutorial Matematika I · ITB · 2023 · Soal 4",
      sourceReferenceId: "assessment-source-2023",
    });
  });

  test("accepts legacy snake-case snapshot fields", () => {
    expect(normalizeQuestionProvenance({
      origin: "itb_example",
      source_event_name: "Kuis Fisika Dasar ITB 2023",
      source_reference_id: "ref-legacy",
    }).sourceEventName).toBe("Kuis Fisika Dasar ITB 2023");
  });
});
