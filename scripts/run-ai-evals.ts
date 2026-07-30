import { GoldenCase } from "../lib/ai/evals/contracts";
import { scoreGoldenCase, summarizeEvaluations } from "../lib/ai/evals/scorers";
import { serializeStudentQuizAttempt } from "../lib/assessment-serialization";
import { verifyCitations } from "../lib/tutor/citation-verifier";
import { canPublishDiktat } from "../lib/diktat/audit-contracts";
import { evaluateQuestionWithCritic } from "../lib/questions/pedagogical-critic";
import { validateFlashcardAtomicity } from "../lib/flashcards/validator";
import { computeSemanticKoHash } from "../lib/knowledge/identity";
import { validatePreflightKos } from "../lib/materials/compiler";

/**
 * Plan 015: Real-Pipeline Golden AI Evaluation Suite
 * Executed via `bun run eval:ai`. Invokes actual domain functions to test zero-tolerance release invariants.
 */

const GOLDEN_CASES: GoldenCase[] = [
  {
    id: "case-tut-01",
    requirementId: "AI-ASSESS-RED-001",
    category: "tutor",
    input: { attemptActive: true },
    expectedOutcome: "redacted",
    prohibitedOutputs: ["correct_indices", "explanation"],
    zeroToleranceInvariant: "active_attempt_redaction",
  },
  {
    id: "case-tut-02",
    requirementId: "AI-TUTOR-CIT-001",
    category: "tutor",
    input: { invalidCitationId: "chk-999" },
    expectedOutcome: "rejected",
    prohibitedOutputs: [],
    zeroToleranceInvariant: "unknown_citation_rejection",
  },
  {
    id: "case-dik-01",
    requirementId: "AI-DIKTAT-001",
    category: "diktat",
    input: { malformedPdf: true },
    expectedOutcome: "unavailable",
    prohibitedOutputs: [],
    zeroToleranceInvariant: "provider_failure_fail_closed",
  },
  {
    id: "case-qst-01",
    requirementId: "AI-QUEST-VER-001",
    category: "questions",
    input: { solverDisagreement: true },
    expectedOutcome: "rejected",
    prohibitedOutputs: ["accepted"],
    zeroToleranceInvariant: "unverified_question_rejection",
  },
  {
    id: "case-fc-01",
    requirementId: "AI-FC-ATOM-001",
    category: "flashcards",
    input: { multiTargetFront: true },
    expectedOutcome: "rejected",
    prohibitedOutputs: ["approved"],
    zeroToleranceInvariant: "flashcard_atomicity_validation",
  },
  {
    id: "case-ko-01",
    requirementId: "AI-KO-HASH-002",
    category: "knowledge",
    input: { title: "Fisika Dasar", content: "Hukum Newton" },
    expectedOutcome: "accepted",
    prohibitedOutputs: [],
    zeroToleranceInvariant: "ko_identity_determinism",
  },
  {
    id: "case-mat-01",
    requirementId: "AI-MAT-COMP-001",
    category: "material",
    input: { inactiveKo: true },
    expectedOutcome: "rejected",
    prohibitedOutputs: ["approved"],
    zeroToleranceInvariant: "material_preflight_validation",
  },
];

export async function runAiEvaluations() {
  console.log("==========================================");
  console.log("  ZYX AI RELIABILITY REAL-PIPELINE EVAL   ");
  console.log("==========================================");
  console.log(`Running ${GOLDEN_CASES.length} real-pipeline golden evaluation cases...\n`);

  const results: Array<{ passed: boolean; violation: boolean }> = [];

  for (const c of GOLDEN_CASES) {
    let pipelineOutput: { status?: string; text?: string; redacted?: boolean; citationsValid?: boolean } = {};

    if (c.zeroToleranceInvariant === "active_attempt_redaction") {
      const serialized = serializeStudentQuizAttempt({
        id: "att-1",
        quizId: "q-1",
        userId: "usr-1",
        isCompleted: false,
        questionsSnapshot: [
          {
            id: "item-1",
            promptStem: "What is torque?",
            options: ["r x F", "F / r"],
            correct_indices: [0],
            explanation: "Torque is r cross F",
          },
        ],
        answersSnapshot: {},
        score: null,
      });

      const q = (serialized.questionsSnapshot as any[])[0];
      const hasRedactedKeys = !("correct_indices" in q) && !("explanation" in q);
      pipelineOutput = { redacted: hasRedactedKeys, text: JSON.stringify(serialized) };
    } else if (c.zeroToleranceInvariant === "unknown_citation_rejection") {
      const verification = verifyCitations({
        citedIds: ["chk-999"],
        allowedSourceIds: ["chk-100", "chk-101"],
        coverageState: "full",
      });
      const unknownCitationDropped = verification.droppedSourceIds.includes("chk-999");
      pipelineOutput = { citationsValid: unknownCitationDropped, text: "Grounded answer" };
    } else if (c.zeroToleranceInvariant === "provider_failure_fail_closed") {
      const canPublish = canPublishDiktat({
        status: "unavailable",
        findings: [{ id: "f1", code: "ERR", severity: "critical", message: "PDF audit unreadable", sourceSpanIds: [] }],
      });
      pipelineOutput = { status: canPublish ? "pass" : "unavailable", text: "Fail closed" };
    } else if (c.zeroToleranceInvariant === "unverified_question_rejection") {
      const evalRes = evaluateQuestionWithCritic({
        promptStem: "What is velocity?",
        options: ["Distance over time", "Mass times acceleration"],
        candidateCorrectIndices: [0],
        explanation: "v = d / t",
        solverResult: { solvedOptionIndex: 1, solverConfidence: 0.9, reasoningSummary: "Calculated" },
      });
      pipelineOutput = { status: evalRes.status, text: evalRes.reasoning };
    } else if (c.zeroToleranceInvariant === "flashcard_atomicity_validation") {
      const valRes = validateFlashcardAtomicity({
        id: "fc-1",
        sourceKoIds: ["ko-1"],
        front: "Apakah definisi kecepatan sekaligus sebutkan komponen percepatan?",
        back: "Kecepatan v dan percepatan a",
        atomicTarget: "kecepatan",
        sourceSpans: [{ sourceMtdId: "mtd-1", startOffset: 0, endOffset: 10, snippet: "kecepatan" }],
        complexityLevel: 0.5,
      });
      pipelineOutput = { status: valRes.isValid ? "accepted" : "rejected", text: valRes.errors.join(", ") };
    } else if (c.zeroToleranceInvariant === "ko_identity_determinism") {
      const hash1 = computeSemanticKoHash("Hukum Newton", "F=ma", "definition", "core");
      const hash2 = computeSemanticKoHash("Hukum Newton", "F=ma", "definition", "core");
      pipelineOutput = { status: hash1 === hash2 ? "accepted" : "rejected", text: hash1 };
    } else if (c.zeroToleranceInvariant === "material_preflight_validation") {
      const preflight = validatePreflightKos([
        { id: "ko-1", title: "KO 1", status: "needs_review", conceptName: "c1", learningOrder: 1 },
      ]);
      pipelineOutput = { status: preflight.valid ? "accepted" : "rejected", text: preflight.errors.join(", ") };
    }

    const score = scoreGoldenCase(c, pipelineOutput);
    results.push({ passed: score.passed, violation: score.violation });

    const statusSymbol = score.passed ? "[PASS]" : "[FAIL]";
    console.log(`${statusSymbol} ${c.id} (${c.requirementId}): ${score.reason}`);
  }

  const summary = summarizeEvaluations(results);

  console.log("\n------------------------------------------");
  console.log(`Total Cases: ${summary.totalCases}`);
  console.log(`Passed Cases: ${summary.passedCases}`);
  console.log(`Failed Cases: ${summary.failedCases}`);
  console.log(`Zero-Tolerance Invariant Violations: ${summary.zeroToleranceViolations}`);
  console.log("------------------------------------------");

  if (!summary.passedInvariants) {
    console.error("FAILED: Zero-tolerance release threshold invariant violated!");
    process.exit(1);
  }

  console.log("SUCCESS: All real-pipeline golden AI evaluation invariants passed 100%!");
}

if (import.meta.main) {
  runAiEvaluations();
}
