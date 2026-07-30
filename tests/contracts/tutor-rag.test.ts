import { describe, expect, it, test } from "bun:test";
import { normalizeQuestion } from "@/lib/tutor-rag";
import { loadAiFixture } from "../helpers/ai-fixtures";
import { assertNoStudentTextInSharedCache } from "../helpers/fake-cache";

describe("Tutor RAG Contract Tests", () => {
  it("characterization: normalizeQuestion lowercases, strips punctuation, and trims questions deterministically", () => {
    expect(normalizeQuestion("   Apa  Definisi LIMIT?  ")).toBe("apa definisi limit");
    expect(normalizeQuestion("TURUNAN   fungsi!")).toBe("turunan fungsi");
  });

  it("characterization: loads citation and prompt injection fixtures with valid schema versions", () => {
    const citationFixture = loadAiFixture("citations.json");
    expect(citationFixture.schemaVersion).toBe("1.0");
    expect(citationFixture.requirementId).toBe("AI-TUTOR-CIT-001");

    const injectionFixture = loadAiFixture("prompt-injection.json");
    expect(injectionFixture.schemaVersion).toBe("1.0");
    expect(injectionFixture.requirementId).toBe("AI-SEC-INJ-001");
  });

  it("characterization: enforces no student identity in shared cache payload", () => {
    const sharedPayload = {
      answer: "Limit fungsi f(x) mendekati c adalah L.",
      sources: ["chk-1"],
    };

    expect(() =>
      assertNoStudentTextInSharedCache("tutor:course-1:all:hash", sharedPayload, ["usr_student_123", "student@example.com"])
    ).not.toThrow();

    const leakedPayload = {
      answer: "Limit fungsi.",
      studentId: "usr_student_123",
    };

    expect(() =>
      assertNoStudentTextInSharedCache("tutor:course-1:all:hash", leakedPayload, ["usr_student_123"])
    ).toThrow();
  });

  test.todo("AI-TUTOR-CIT-001: Reject citation IDs that do not exist in retrieved source set");
  test.todo("AI-TUTOR-COV-001: Return ungrounded status when retrieved chunks lack sufficient context");
  test.todo("AI-TUTOR-DLG-001: Classify follow-up user inputs into style changes vs topic shifts");
  test.todo("AI-SEC-INJ-001: Neutralize system prompt injection embedded in retrieved materials");
});
