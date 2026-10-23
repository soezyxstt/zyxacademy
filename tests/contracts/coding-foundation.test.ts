import { describe, expect, it } from "bun:test";
import { codingBlockSchema, codingProblemPrivateSchema, codingSubmissionRequestSchema, toPublicCodingProblem, type CodingProblemPrivate, type CodingSubmissionRequest } from "@/lib/coding/contracts";
import { evaluateCodingPractice, evaluateCodingSubmission, publicCodingFeedback } from "@/lib/coding/evaluation";
import { executePython, type PythonRuntime } from "@/lib/coding/runtime";
import { deriveLiveCodingScore, liveCodingQuestionSchema } from "@/lib/coding/live";
import { buildCodingTutorContext, buildPlaygroundTutorContext, codingTutorResponseSchema, serializeCodingTutorFlowchart } from "@/lib/coding/zyra";
import { submitCodingAttempt, type CodingAttempt, type CodingAttemptRepository } from "@/lib/coding/submissions";

const problem: CodingProblemPrivate = {
  problemId: "sum-even", version: 1, courseId: "computational-thinking", language: "python",
  title: "Jumlah bilangan genap", prompt: "Jumlahkan bilangan genap hingga n.",
  learningObjectives: ["Memahami batas perulangan"], starterCode: "",
  publicTests: [{ id: "public-6", stdin: "6", expectedStdout: "12\n" }],
  privateTests: [{ id: "secret-2", stdin: "2", expectedStdout: "2\n" }],
  limits: { timeoutMs: 500, maxOutputChars: 100 },
  referenceSolution: "print(sum(range(0, int(input()) + 1, 2)))",
  solutionExplanation: "Batas akhir harus menyertakan n.", misconceptions: [],
};
const request: CodingSubmissionRequest = { requestId: "request-1", problem: { problemId: problem.problemId, version: 1 }, code: "print(12)", stdin: "" };
const runtime: PythonRuntime = { async execute({ stdin }) {
  return { status: "completed", stdout: stdin === "6" ? "12\n" : "wrong", stderr: "", truncated: false };
} };

describe("coding foundation", () => {
  it("projects only public content and rejects private fields in submissions", () => {
    const publicProblem = toPublicCodingProblem(problem);
    expect(publicProblem).not.toHaveProperty("referenceSolution");
    expect(publicProblem).not.toHaveProperty("privateTests");
    expect(codingSubmissionRequestSchema.safeParse({ ...request, authority: "trusted_server" }).success).toBe(false);
    expect(codingBlockSchema.safeParse({ mode: "exercise", problem: request.problem }).success).toBe(true);
  });
  it("rejects missing tests, duplicate test IDs and stale versions", async () => {
    expect(codingProblemPrivateSchema.safeParse({ ...problem, publicTests: [], privateTests: [] }).success).toBe(false);
    expect(codingProblemPrivateSchema.safeParse({ ...problem, privateTests: problem.publicTests }).success).toBe(false);
    await expect(evaluateCodingSubmission(problem, { ...request, problem: { ...request.problem, version: 2 } }, runtime)).rejects.toThrow("VERSION_MISMATCH");
  });
  it("distinguishes public practice from full evaluation and redacts private execution", async () => {
    const practice = await evaluateCodingPractice(toPublicCodingProblem(problem), request, runtime);
    expect(practice.verdict).toBe("correct");
    expect(practice.authority).toBe("browser_practice");
    const evaluation = await evaluateCodingSubmission(problem, request, runtime);
    expect(evaluation.verdict).toBe("partial");
    expect(publicCodingFeedback(toPublicCodingProblem(problem), evaluation).publicCases).toHaveLength(1);
    expect(deriveLiveCodingScore(problem, [evaluation], "best")).toBe(0.5);
    expect(() => deriveLiveCodingScore(problem, [practice], "best")).toThrow("INVALID_SCORE_EVIDENCE");
  });
  it("does not turn unavailable runtime or cancelled work into a wrong answer", async () => {
    const unavailable: PythonRuntime = { async execute() { throw new Error("private backend details"); } };
    const result = await evaluateCodingSubmission(problem, request, unavailable);
    expect(result.verdict).toBe("ungradable");
    expect(JSON.stringify(result)).not.toContain("private backend details");
    const controller = new AbortController(); controller.abort();
    expect((await executePython(runtime, { code: "", stdin: "", limits: problem.limits, signal: controller.signal })).status).toBe("stopped");
  });
  it("preserves output significance, caps output and never accepts truncated output", async () => {
    const noisy: PythonRuntime = { async execute() { return { status: "completed", stdout: "x".repeat(110), stderr: "error", truncated: false }; } };
    const result = await executePython(noisy, { code: "", stdin: "", limits: problem.limits });
    expect(result.stdout.length + result.stderr.length).toBe(100);
    expect(result.truncated).toBe(true);
    const spaces: PythonRuntime = { async execute() { return { status: "completed", stdout: " 12\n", stderr: "", truncated: false }; } };
    expect((await evaluateCodingPractice(toPublicCodingProblem(problem), request, spaces)).verdict).toBe("incorrect");
  });
  it("keeps private tests out of Zyra context and blocks disabled assistance", async () => {
    const evaluation = await evaluateCodingSubmission(problem, request, runtime);
    const input = { problem, code: request.code, evaluation, previousCodes: [], intent: "hint" as const, assistance: "hints" as const };
    const context = buildCodingTutorContext(input);
    expect(context.problem.referenceSolution).toBeNull();
    expect(context.evaluation?.publicCases).toHaveLength(1);
    expect(JSON.stringify(context)).not.toContain("secret-2");
    expect(() => buildCodingTutorContext({ ...input, assistance: "disabled" })).toThrow("ASSISTANCE_DISABLED");
    expect(buildCodingTutorContext({ ...input, assistance: "full" }).problem.referenceSolution).toBe(problem.referenceSolution);
  });
  it("validates and serializes flowcharts through the existing renderer contract", () => {
    const response = {
      observation: "Periksa batas perulangan.", hypothesis: null, nextStep: "Coba n = 2.",
      flowchart: { represents: "solution_plan", visual: {
        type: "flowchart", title: "Jumlah genap", semanticLabels: ["Mulai", "Selesai"], values: {},
        relationships: [{ sourceNode: "Mulai", targetNode: "Selesai" }], sourceClaimIds: [], altDescription: "Alur penjumlahan bilangan genap.",
      } },
    };
    expect(serializeCodingTutorFlowchart(response)).toContain(":::flowchart");
    expect(codingTutorResponseSchema.safeParse({ ...response, flowchart: { ...response.flowchart, visual: { ...response.flowchart.visual, relationships: [{ sourceNode: "missing", targetNode: "Selesai" }] } } }).success).toBe(false);
  });
  it("requires explicit Live Quiz assistance, retry and scoring policies", () => {
    expect(liveCodingQuestionSchema.safeParse({ protocol: "live-coding.v1", kind: "python", sessionId: "session", questionId: "question", problem: toPublicCodingProblem(problem) }).success).toBe(false);
  });
  it("replays a reserved submission without executing or overwriting it", async () => {
    const evaluation = await evaluateCodingSubmission(problem, request, runtime);
    const attempt: CodingAttempt = { id: "attempt", learnerId: "learner", courseId: problem.courseId, surface: "article", surfaceId: "block", ordinal: 1, request, evaluation };
    let executions = 0;
    const repository: CodingAttemptRepository = {
      async reserve() { return { created: false, attempt }; },
      async complete() { throw new Error("must not overwrite"); },
    };
    const result = await submitCodingAttempt(repository, { ...attempt, maxAttempts: null, deadlineMs: null }, async () => { executions++; return evaluation; });
    expect(result).toBe(attempt);
    expect(executions).toBe(0);
  });
});


describe("coding execution and submission boundaries", () => {
  it("distinguishes execution errors and timeouts from successful execution", async () => {
    for (const status of ["syntax_error", "runtime_error", "timeout"] as const) {
      const failing: PythonRuntime = { async execute() { return { status, stdout: "", stderr: "error", truncated: false }; } };
      const result = await evaluateCodingSubmission(problem, request, failing);
      expect(result.verdict).toBe("incorrect");
      expect(result.cases[0].execution.status).toBe(status);
    }
  });
  it("accepts equivalent line endings and reports all cases passing", async () => {
    const passing: PythonRuntime = { async execute({ stdin }) { return { status: "completed", stdout: stdin === "6" ? "12\r\n" : "2\n", stderr: "", truncated: false }; } };
    const result = await evaluateCodingSubmission(problem, request, passing);
    expect(result.verdict).toBe("correct");
    expect(deriveLiveCodingScore(problem, [result], "latest")).toBe(1);
  });
  it("does not report success for a practice problem with no public tests", async () => {
    expect((await evaluateCodingPractice({ ...toPublicCodingProblem(problem), publicTests: [] }, request, runtime)).verdict).toBe("ungradable");
  });
  it("completes a new reserved attempt only with trusted matching evaluation", async () => {
    const evaluation = await evaluateCodingSubmission(problem, request, runtime);
    const attempt: CodingAttempt = { id: "attempt-2", learnerId: "learner", courseId: problem.courseId, surface: "article", surfaceId: "block", ordinal: 2, request, evaluation: null };
    const repository: CodingAttemptRepository = {
      async reserve() { return { created: true, attempt }; },
      async complete(id, result) { expect(id).toBe(attempt.id); return { ...attempt, evaluation: result }; },
    };
    const input = { ...attempt, maxAttempts: null, deadlineMs: null };
    expect((await submitCodingAttempt(repository, input, async () => evaluation)).evaluation).toEqual(evaluation);
    await expect(submitCodingAttempt(repository, input, async () => ({ ...evaluation, authority: "browser_practice" }))).rejects.toThrow("TRUSTED_EVALUATION_REQUIRED");
    await expect(submitCodingAttempt(repository, input, async () => ({ ...evaluation, problem: { ...evaluation.problem, version: 2 } }))).rejects.toThrow("VERSION_MISMATCH");
  });
  it("supports Playground coaching without inventing a canonical problem", () => {
    const context = buildPlaygroundTutorContext({ code: "print(1)", execution: { status: "completed", stdout: "1", stderr: "", truncated: false }, intent: "review" });
    expect(context.policy.noCanonicalAnswerAvailable).toBe(true);
    expect(context).not.toHaveProperty("problem");
  });
});

describe("cross-device draft reconciliation", () => {
  it("preserves local edits rather than rebasing them silently onto a newer server revision", async () => {
    const { reconcileCodingDraft } = await import("@/lib/coding/draft-reconciliation");
    const local = { code: "local edits", stdin: "", revision: 1 };
    const remote = { code: "another device", stdin: "", revision: 2 };
    expect(reconcileCodingDraft(local, remote).conflict).toBe(true);
    expect(reconcileCodingDraft({ ...local, revision: 2 }, remote).conflict).toBe(false);
    expect(reconcileCodingDraft(null, remote).source).toBe("remote");
    expect(reconcileCodingDraft(local, null).revision).toBe(0);
  });
});

describe("coding consultation execution context", () => {
  it("does not invent a completed execution before Run", () => {
    expect(buildPlaygroundTutorContext({ code: "print(1)", execution: null, intent: "review" }).execution).toBeNull();
  });
  it("allows an exercise Run result without accepting a trusted verdict from the browser", async () => {
    const { codingHelpRequestSchema } = await import("@/lib/coding/http-contracts");
    const context = { kind: "exercise", problem: request.problem, code: "1 / 0", intent: "explain_error", surface: { kind: "article", articleId: "article", articleVersion: 1, partId: "exercise" }, execution: { status: "runtime_error", stdout: "", stderr: "ZeroDivisionError", truncated: false } };
    expect(codingHelpRequestSchema.safeParse(context).success).toBe(true);
    expect(codingHelpRequestSchema.safeParse({ ...context, verdict: "correct" }).success).toBe(false);
  });
});
