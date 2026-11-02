import { executionResultSchema, pythonSourceSchema, runtimeLimitsSchema, type ExecutionResult, type RuntimeLimits } from "./contracts";

/** Browser implementations must run in a disposable Worker on an isolated origin.
 * Server implementations must use a sandbox, never eval/exec in the web process.
 * input() consumes supplied stdin; no implicit network, filesystem or package access.
 */
export interface PythonRuntime {
  execute(request: { code: string; stdin: string; limits: RuntimeLimits; signal?: AbortSignal }): Promise<ExecutionResult>;
}

/** Adapter contract, not a security sandbox. The adapter must enforce hard termination. */
export async function executePython(
  runtime: PythonRuntime,
  request: { code: string; stdin: string; limits: RuntimeLimits; signal?: AbortSignal },
): Promise<ExecutionResult> {
  const code = pythonSourceSchema.parse(request.code);
  const limits = runtimeLimitsSchema.parse(request.limits);
  if (request.stdin.length > 8_000) throw new Error("CODING_INPUT_TOO_LARGE");
  if (request.signal?.aborted) return { status: "stopped", stdout: "", stderr: "", truncated: false };
  try {
    const result = executionResultSchema.parse(await runtime.execute({ ...request, code, limits }));
    const stdout = result.stdout.slice(0, limits.maxOutputChars);
    const stderr = result.stderr.slice(0, Math.max(0, limits.maxOutputChars - stdout.length));
    return { ...result, stdout, stderr, truncated: result.truncated || stdout !== result.stdout || stderr !== result.stderr };
  } catch {
    return { status: request.signal?.aborted ? "stopped" : "unavailable", stdout: "", stderr: "", truncated: false };
  }
}
