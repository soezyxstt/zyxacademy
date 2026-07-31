import { GoldenCase, EvaluationSummary } from "./contracts";

/**
 * Plan 015: Deterministic Evaluation Scorers
 */

export function scoreGoldenCase(
  goldenCase: GoldenCase,
  actualOutput: {
    status?: string;
    text?: string;
    redacted?: boolean;
    citationsValid?: boolean;
  }
): { passed: boolean; violation: boolean; reason: string } {
  const prohibitedOutputs = goldenCase.prohibitedOutputs ?? [];

  // Check prohibited outputs
  if (actualOutput.text) {
    for (const prohibited of prohibitedOutputs) {
      if (actualOutput.text.includes(prohibited)) {
        return {
          passed: false,
          violation: true,
          reason: `Output contains prohibited text '${prohibited}'`,
        };
      }
    }
  }

  // Check expected outcome status if present
  if (goldenCase.expectedOutcome && actualOutput.status) {
    if (actualOutput.status.toLowerCase() !== goldenCase.expectedOutcome.toLowerCase()) {
      return {
        passed: false,
        violation: goldenCase.zeroToleranceInvariant !== undefined,
        reason: `Outcome mismatch: expected '${goldenCase.expectedOutcome}', got '${actualOutput.status}'`,
      };
    }
  } else if (goldenCase.expectedOutcome && !actualOutput.status && !actualOutput.redacted && !actualOutput.citationsValid) {
    return {
      passed: false,
      violation: goldenCase.zeroToleranceInvariant !== undefined,
      reason: "Missing output status or assertion result in evaluation",
    };
  }

  // Zero-tolerance invariant checks
  if (goldenCase.zeroToleranceInvariant === "active_attempt_redaction") {
    if (actualOutput.redacted === undefined || actualOutput.redacted === false) {
      return {
        passed: false,
        violation: true,
        reason: "ZERO TOLERANCE: Active attempt answer redaction failed or missing assertion",
      };
    }
  }

  if (goldenCase.zeroToleranceInvariant === "unknown_citation_rejection") {
    if (actualOutput.citationsValid === undefined || actualOutput.citationsValid === false) {
      return {
        passed: false,
        violation: true,
        reason: "ZERO TOLERANCE: Unknown citation was accepted or missing assertion",
      };
    }
  }

  if (goldenCase.zeroToleranceInvariant === "provider_failure_fail_closed") {
    if (actualOutput.status === undefined || actualOutput.status === "pass" || actualOutput.status === "success") {
      return {
        passed: false,
        violation: true,
        reason: "ZERO TOLERANCE: Synthetic success returned or missing status after failure",
      };
    }
  }

  if (goldenCase.zeroToleranceInvariant === "unverified_question_rejection") {
    if (actualOutput.status !== "rejected") {
      return {
        passed: false,
        violation: true,
        reason: "ZERO TOLERANCE: Unverified/disagreed question was not rejected",
      };
    }
  }

  if (goldenCase.zeroToleranceInvariant === "flashcard_atomicity_validation") {
    if (actualOutput.status !== "rejected") {
      return {
        passed: false,
        violation: true,
        reason: "ZERO TOLERANCE: Non-atomic flashcard front was not rejected",
      };
    }
  }

  if (goldenCase.zeroToleranceInvariant === "ko_identity_determinism") {
    if (actualOutput.status !== "accepted") {
      return {
        passed: false,
        violation: true,
        reason: "ZERO TOLERANCE: KO semantic identity hash was not deterministic",
      };
    }
  }

  if (goldenCase.zeroToleranceInvariant === "material_preflight_validation") {
    if (actualOutput.status !== "rejected") {
      return {
        passed: false,
        violation: true,
        reason: "ZERO TOLERANCE: Preflight check accepted invalid/needs_review KOs",
      };
    }
  }

  return {
    passed: true,
    violation: false,
    reason: "Passed golden case evaluation",
  };
}

export function summarizeEvaluations(
  results: Array<{ passed: boolean; violation: boolean }>
): EvaluationSummary {
  let passedCases = 0;
  let failedCases = 0;
  let zeroToleranceViolations = 0;

  for (const r of results) {
    if (r.passed) {
      passedCases++;
    } else {
      failedCases++;
    }
    if (r.violation) {
      zeroToleranceViolations++;
    }
  }

  return {
    totalCases: results.length,
    passedCases,
    failedCases,
    zeroToleranceViolations,
    passedInvariants: zeroToleranceViolations === 0,
  };
}
