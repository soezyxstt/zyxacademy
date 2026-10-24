import { codingProblemPrivateSchema, codingProblemPublicSchema, codingSubmissionRequestSchema, type CodingEvaluation, type CodingProblemPrivate, type CodingProblemPublic, type CodingSubmissionRequest } from "./contracts";
import { executePython, type PythonRuntime } from "./runtime";

/** Whitespace inside lines remains significant. Only newline convention and one final newline are normalized. */
export function normalizePythonOutput(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\n$/, "");
}

async function evaluate(
  problem: CodingProblemPublic,
  request: CodingSubmissionRequest,
  tests: CodingProblemPublic["publicTests"],
  authority: CodingEvaluation["authority"],
  runtime: PythonRuntime,
  signal?: AbortSignal,
): Promise<CodingEvaluation> {
  const submission = codingSubmissionRequestSchema.parse(request);
  if (submission.problem.problemId !== problem.problemId || submission.problem.version !== problem.version) {
    throw new Error("CODING_PROBLEM_VERSION_MISMATCH");
  }
  const cases: CodingEvaluation["cases"] = [];
  for (const test of tests) {
    const execution = await executePython(runtime, { code: submission.code, stdin: test.stdin, limits: problem.limits, signal });
    cases.push({ testId: test.id, execution, passed: execution.status === "completed" && !execution.truncated && normalizePythonOutput(execution.stdout) === normalizePythonOutput(test.expectedStdout) });
    if (["stopped", "unavailable"].includes(execution.status)) break;
  }
  const passed = cases.filter((item) => item.passed).length;
  const ungradable = !cases.length || cases.some((item) => ["stopped", "unavailable"].includes(item.execution.status));
  return {
    problem: { problemId: problem.problemId, version: problem.version }, authority, cases,
    verdict: ungradable ? "ungradable" : passed === tests.length ? "correct" : passed ? "partial" : "incorrect",
  };
}

export function evaluateCodingPractice(problem: CodingProblemPublic, request: CodingSubmissionRequest, runtime: PythonRuntime, signal?: AbortSignal) {
  const parsed = codingProblemPublicSchema.parse(problem);
  return evaluate(parsed, request, parsed.publicTests, "browser_practice", runtime, signal);
}

/** Call only after authentication, course access, canonical problem lookup and atomic attempt reservation.
 * The runtime must be a trusted sandbox adapter, never selected from the request body.
 */
export function evaluateCodingSubmission(problem: CodingProblemPrivate, request: CodingSubmissionRequest, trustedRuntime: PythonRuntime, signal?: AbortSignal) {
  const parsed = codingProblemPrivateSchema.parse(problem);
  return evaluate(parsed, request, [...parsed.publicTests, ...parsed.privateTests], "trusted_server", trustedRuntime, signal);
}

export function publicCodingFeedback(problem: CodingProblemPublic, evaluation: CodingEvaluation) {
  if (evaluation.problem.problemId !== problem.problemId || evaluation.problem.version !== problem.version) throw new Error("CODING_PROBLEM_VERSION_MISMATCH");
  const publicIds = new Set(problem.publicTests.map((test) => test.id));
  // Private executions can print hidden stdin or even solution material. Never project them.
  return {
    problem: evaluation.problem, authority: evaluation.authority, verdict: evaluation.verdict,
    passed: evaluation.cases.filter((item) => item.passed).length,
    total: evaluation.cases.length,
    publicCases: evaluation.cases.filter((item) => publicIds.has(item.testId)),
  };
}
