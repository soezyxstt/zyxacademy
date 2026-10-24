import { z } from "zod";

const id = z.string().trim().min(1).max(160);
export const pythonSourceSchema = z.string().max(64_000);
export const codingLocatorSchema = z.object({
  problemId: id,
  version: z.number().int().positive(),
}).strict();
export const runtimeLimitsSchema = z.object({
  timeoutMs: z.number().int().min(100).max(30_000).default(5_000),
  maxOutputChars: z.number().int().min(100).max(64_000).default(8_000),
}).strict();
export const codingTestSchema = z.object({
  id,
  stdin: z.string().max(8_000),
  expectedStdout: z.string().max(64_000),
}).strict();
export const codingProblemPublicSchema = codingLocatorSchema.extend({
  courseId: id,
  language: z.literal("python"),
  title: z.string().trim().min(1).max(300),
  prompt: z.string().trim().min(1).max(16_000),
  learningObjectives: z.array(z.string().min(1).max(1_000)).min(1).max(20),
  starterCode: pythonSourceSchema,
  publicTests: z.array(codingTestSchema).max(50),
  limits: runtimeLimitsSchema,
}).strict();
export const codingProblemPrivateSchema = codingProblemPublicSchema.extend({
  referenceSolution: pythonSourceSchema.min(1),
  solutionExplanation: z.string().min(1).max(16_000),
  privateTests: z.array(codingTestSchema).max(50),
  misconceptions: z.array(z.object({
    id,
    description: z.string().min(1).max(2_000),
    diagnosticQuestion: z.string().min(1).max(1_000),
  }).strict()).max(30),
}).superRefine((problem, ctx) => {
  const tests = [...problem.publicTests, ...problem.privateTests];
  if (tests.length > 20 || tests.length * problem.limits.timeoutMs > 25_000) ctx.addIssue({ code: "custom", message: "Total test execution budget exceeds 25 seconds" });
  if (!tests.length) ctx.addIssue({ code: "custom", message: "At least one test is required" });
  if (new Set(tests.map((test) => test.id)).size !== tests.length) {
    ctx.addIssue({ code: "custom", message: "Test IDs must be unique" });
  }
});

export const codingBlockSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("example"),
    language: z.literal("python"),
    code: pythonSourceSchema,
    runnable: z.boolean(),
  }).strict(),
  z.object({ mode: z.literal("exercise"), problem: codingLocatorSchema }).strict(),
]);

// Identity, deadline, attempt ordinal and grading policy come from the server.
export const codingSubmissionRequestSchema = z.object({
  requestId: id,
  problem: codingLocatorSchema,
  code: pythonSourceSchema,
  stdin: z.string().max(8_000).default(""),
}).strict();
export const executionResultSchema = z.object({
  status: z.enum(["completed", "syntax_error", "runtime_error", "timeout", "stopped", "unavailable"]),
  stdout: z.string().max(64_000),
  stderr: z.string().max(64_000),
  truncated: z.boolean(),
}).strict();
export const codingEvaluationSchema = z.object({
  problem: codingLocatorSchema,
  authority: z.enum(["browser_practice", "trusted_server"]),
  verdict: z.enum(["correct", "partial", "incorrect", "ungradable"]),
  cases: z.array(z.object({
    testId: id,
    passed: z.boolean(),
    execution: executionResultSchema,
  }).strict()).max(100),
}).strict();
export type CodingProblemPublic = z.infer<typeof codingProblemPublicSchema>;
export type CodingProblemPrivate = z.infer<typeof codingProblemPrivateSchema>;
export type CodingSubmissionRequest = z.infer<typeof codingSubmissionRequestSchema>;
export type ExecutionResult = z.infer<typeof executionResultSchema>;
export type CodingEvaluation = z.infer<typeof codingEvaluationSchema>;
export type RuntimeLimits = z.infer<typeof runtimeLimitsSchema>;

// Explicit projection prevents reference solutions and private tests reaching a client.
export function toPublicCodingProblem(input: CodingProblemPrivate): CodingProblemPublic {
  const problem = codingProblemPrivateSchema.parse(input);
  return codingProblemPublicSchema.parse({
    problemId: problem.problemId, version: problem.version, courseId: problem.courseId,
    language: problem.language, title: problem.title, prompt: problem.prompt,
    learningObjectives: problem.learningObjectives, starterCode: problem.starterCode,
    publicTests: problem.publicTests, limits: problem.limits,
  });
}
