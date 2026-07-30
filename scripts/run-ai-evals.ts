import { GoldenCase } from "../lib/ai/evals/contracts";
import { scoreGoldenCase, summarizeEvaluations } from "../lib/ai/evals/scorers";
import { serializeStudentQuizAttempt } from "../lib/assessment-serialization";
import { verifyCitations } from "../lib/tutor/citation-verifier";
import { canPublishDiktat } from "../lib/diktat/audit-contracts";

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
      // Execute actual assessment redaction pipeline
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
      // Execute actual citation verification pipeline
      const verification = verifyCitations({
        citedIds: ["chk-999"],
        allowedSourceIds: ["chk-100", "chk-101"],
        coverageState: "full",
      });
      const unknownCitationDropped = verification.droppedSourceIds.includes("chk-999");
      pipelineOutput = { citationsValid: unknownCitationDropped, text: "Grounded answer" };
    } else if (c.zeroToleranceInvariant === "provider_failure_fail_closed") {
      // Execute actual diktat publication check pipeline
      const canPublish = canPublishDiktat({
        status: "unavailable",
        findings: [{ id: "f1", code: "ERR", severity: "critical", message: "PDF audit unreadable", sourceSpanIds: [] }],
      });
      pipelineOutput = { status: canPublish ? "pass" : "unavailable", text: "Fail closed" };
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
