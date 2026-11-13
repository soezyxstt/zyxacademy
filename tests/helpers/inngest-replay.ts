import type { Inngest } from "inngest";

type Memo = { id: string; data?: unknown; error?: unknown };
type Op = { id: string; op: string; displayName?: string; data?: unknown; error?: unknown };
type Result = { type: string; data?: unknown; error?: unknown; step?: Op; steps?: Op[] };

/**
 * Drives the installed Inngest SDK's real async execution engine. Only the
 * external coordinator is simulated: checkpoints cross a JSON boundary,
 * exhausted errors are replayed, and Sleep is acknowledged without waiting.
 * This uses the SDK's internal createExecution seam, pinned by local tests;
 * it does not establish hosted Inngest transport or scheduling behavior.
 */
export function inngestReplay(client: Inngest.Any, fn: unknown, event: { name: string; data: Record<string, unknown> }) {
  const state: Record<string, Memo> = {};
  const order: string[] = [];
  const failures = new Map<string, number>();
  const trace: Array<{ id: string; op: string; name?: string }> = [];
  const runId = crypto.randomUUID();
  const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));
  const executable = fn as { createExecution(options: unknown): { start(): Promise<Result> } };

  async function run(): Promise<unknown> {
    let requestedRunStep: string | undefined;
    for (let request = 0; request < 256; request++) {
      const result = await executable.createExecution({ partialOptions: {
        client, runId, reqArgs: [], headers: {}, stepMode: "async", disableImmediateExecution: true,
        data: { event, events: [event], runId, attempt: 0 },
        stepState: json(state), stepCompletionOrder: [...order], requestedRunStep,
      } }).start();
      requestedRunStep = undefined;
      if (result.type === "function-resolved") return result.data;
      if (result.type === "function-rejected") throw new Error(`SDK function rejected: ${JSON.stringify(result.error)}`);
      if (result.type === "steps-found") {
        const [op] = result.steps ?? [];
        if (!op) throw new Error("SDK discovered no step");
        if (op.op === "Sleep") {
          trace.push({ id: op.id, op: op.op, name: op.displayName });
          state[op.id] = { id: op.id, data: null };
          order.push(op.id);
        } else if (op.op === "StepPlanned") requestedRunStep = op.id;
        else throw new Error(`Unsupported SDK operation: ${op.op}`);
        continue;
      }
      if (result.type !== "step-ran" || !result.step) throw new Error(`Unexpected SDK result: ${result.type}`);
      const op = result.step;
      trace.push({ id: op.id, op: op.op, name: op.displayName });
      if (op.op === "StepError" || op.op === "StepFailed") {
        const count = (failures.get(op.id) ?? 0) + 1;
        failures.set(op.id, count);
        if (op.op === "StepError" && count < 2) { requestedRunStep = op.id; continue; }
        state[op.id] = { id: op.id, error: json(op.error ?? { name: "Error", message: "Step failed" }) };
      } else if (op.op === "StepRun") state[op.id] = { id: op.id, data: json(op.data ?? null) };
      else throw new Error(`Unexpected SDK step result: ${op.op}`);
      order.push(op.id);
    }
    throw new Error("SDK replay exceeded bounded request limit");
  }
  return { run, trace, failures, state };
}
