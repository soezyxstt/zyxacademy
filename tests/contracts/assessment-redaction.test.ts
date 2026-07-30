import { describe, expect, it } from "bun:test";

process.env.MOCK_GEMINI = "true";
import { loadAiFixture } from "../helpers/ai-fixtures";
import {
  serializeStudentQuizAttempt,
  serializeStudentQuizAttemptList,
} from "@/lib/assessment-serialization";
import {
  evaluateAssessmentAssistancePolicy,
  validateTutorOutput,
} from "@/lib/assessment-assistance-policy";

function assertNoProtectedKeys(obj: unknown): void {
  if (!obj || typeof obj !== "object") return;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      assertNoProtectedKeys(item);
    }
    return;
  }

  const record = obj as Record<string, unknown>;
  expect(record).not.toHaveProperty("correct_indices");
  expect(record).not.toHaveProperty("correctIndices");
  expect(record).not.toHaveProperty("explanation");

  for (const value of Object.values(record)) {
    if (typeof value === "object" && value !== null) {
      assertNoProtectedKeys(value);
    }
  }
}

describe("Assessment Redaction Contract Tests", () => {
  it("characterization: validates assessment context fixtures for answer redaction invariants", () => {
    const fixture = loadAiFixture<{
      status: string;
      quizId: string | null;
      attemptId: string | null;
      shouldRedactAnswers: boolean;
    }>("assessment-context.json");

    expect(fixture.schemaVersion).toBe("1.0");
    expect(fixture.requirementId).toBe("AI-ASSESS-RED-001");

    const { activeAttempt, completedAttempt, ordinaryStudy } = fixture.fixtures;
    expect(activeAttempt.shouldRedactAnswers).toBe(true);
    expect(completedAttempt.shouldRedactAnswers).toBe(false);
    expect(ordinaryStudy.shouldRedactAnswers).toBe(false);
  });

  it("AI-ASSESS-RED-001: Redact option key answers and solution explanations during active quiz attempts", () => {
    const activeAttempt = {
      id: "att-123",
      studentId: "user-456",
      templateId: "tpl-789",
      status: "in_progress",
      startedAt: new Date(),
      score: 100,
      questionsSnapshot: [
        {
          id: "q-1",
          prompt: "Berapakah 2 + 2?",
          options: ["3", "4", "5", "6"],
          correct_indices: [1],
          explanation: "2 + 2 sama dengan 4.",
          difficulty: "easy",
        },
      ],
      answersSnapshot: { "q-1": [1] },
      feedback: [{ id: "fb-1", whyWrong: "Leaked feedback" }],
    };

    const serialized = serializeStudentQuizAttempt(activeAttempt);

    expect(serialized.status).toBe("in_progress");
    expect(serialized.score).toBeNull();
    expect(serialized.feedback).toEqual([]);
    assertNoProtectedKeys(serialized.questionsSnapshot);

    // List serialization test
    const serializedList = serializeStudentQuizAttemptList([activeAttempt]);
    expect(serializedList).toHaveLength(1);
    assertNoProtectedKeys(serializedList[0].questionsSnapshot);
  });

  it("AI-ASSESS-RED-002: Expose full solution explanations after attempt completion or during study mode", () => {
    const completedAttempt = {
      id: "att-999",
      studentId: "user-456",
      templateId: "tpl-789",
      status: "completed",
      startedAt: new Date(),
      submittedAt: new Date(),
      score: 100,
      questionsSnapshot: [
        {
          id: "q-1",
          prompt: "Berapakah 2 + 2?",
          options: ["3", "4", "5", "6"],
          correct_indices: [1],
          explanation: "2 + 2 sama dengan 4.",
          difficulty: "easy",
        },
      ],
      answersSnapshot: { "q-1": [1] },
      feedback: [{ id: "fb-1", whyWrong: "Penjelasan miskonsepsi" }],
    };

    const released = serializeStudentQuizAttempt(completedAttempt, { releaseState: "released" });
    expect(released.status).toBe("completed");
    expect(released.questionsSnapshot[0].correct_indices).toEqual([1]);
    expect(released.questionsSnapshot[0].explanation).toBe("2 + 2 sama dengan 4.");

    const hidden = serializeStudentQuizAttempt(completedAttempt, { releaseState: "hidden" });
    assertNoProtectedKeys(hidden.questionsSnapshot);
    expect(hidden.feedback).toEqual([]);
  });

  it("AI-ASSESS-POL-001: Evaluates assessment assistance policy deterministically and fails closed on unknown input", () => {
    // Unknown input fails closed
    const invalidRes = evaluateAssessmentAssistancePolicy({
      activityKind: "invalid_kind" as any,
      attemptState: "in_progress",
      answerReleaseState: "hidden",
      matchState: "exact",
    });
    expect(invalidRes.allowedHelpLevel).toBe("refuse_answer_reveal");
    expect(invalidRes.reasonCode).toBe("UNKNOWN_INPUT_FAIL_CLOSED");

    // Active quiz attempt with exact question match
    const activeExact = evaluateAssessmentAssistancePolicy({
      activityKind: "quiz",
      attemptState: "in_progress",
      answerReleaseState: "hidden",
      matchState: "exact",
    });
    expect(activeExact.allowedHelpLevel).toBe("refuse_answer_reveal");
    expect(activeExact.allowDirectAnswerReveal).toBe(false);

    // Active quiz attempt with strong match
    const activeStrong = evaluateAssessmentAssistancePolicy({
      activityKind: "quiz",
      attemptState: "in_progress",
      answerReleaseState: "hidden",
      matchState: "strong",
    });
    expect(activeStrong.allowedHelpLevel).toBe("socratic_only");
    expect(activeStrong.allowDirectAnswerReveal).toBe(false);

    // Study mode allows full explanation
    const studyRes = evaluateAssessmentAssistancePolicy({
      activityKind: "study",
      attemptState: "none",
      answerReleaseState: "released",
      matchState: "none",
    });
    expect(studyRes.allowedHelpLevel).toBe("full_explanation");
    expect(studyRes.allowDirectAnswerReveal).toBe(true);
  });

  it("AI-ASSESS-VAL-001: Validates generated tutor output against protected answer text", () => {
    const protectedData = {
      correctOptions: ["Pilihan B: 4"],
      explanationText: "Langkah penyelesaian limit dengan substitusi langsung.",
    };

    const leakingOutput = "Jawaban yang benar adalah Pilihan B: 4 karena ini pasti 4.";
    const check1 = validateTutorOutput(leakingOutput, protectedData, "socratic_only");
    expect(check1.valid).toBe(false);
    expect(check1.violations).toContain("EXACT_OPTION_TEXT_LEAK");

    const safeOutput = "Untuk menyelesaikan soal ini, coba perhatikan kembali konsep limit dasar.";
    const check2 = validateTutorOutput(safeOutput, protectedData, "socratic_only");
    expect(check2.valid).toBe(true);
  });
});
