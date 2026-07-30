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

  // Zero-tolerance invariant checks
  if (goldenCase.zeroToleranceInvariant === "active_attempt_redaction") {
    if (actualOutput.redacted === false) {
      return {
        passed: false,
        violation: true,
        reason: "ZERO TOLERANCE: Active attempt answer redaction failed",
      };
    }
  }

  if (goldenCase.zeroToleranceInvariant === "unknown_citation_rejection") {
    if (actualOutput.citationsValid === false) {
      return {
        passed: false,
        violation: true,
        reason: "ZERO TOLERANCE: Unknown citation was accepted",
      };
    }
  }

  if (goldenCase.zeroToleranceInvariant === "provider_failure_fail_closed") {
    if (actualOutput.status === "pass" || actualOutput.status === "success") {
      return {
        passed: false,
        violation: true,
        reason: "ZERO TOLERANCE: Synthetic success returned after provider/parser failure",
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
