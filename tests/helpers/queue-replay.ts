import type { JobContext, RegisteredQueueJob } from "@/jobs/define-job";
import type { QueueEvent } from "@/lib/queue/cloud-tasks";

type Memo = { id: string; data?: unknown; error?: unknown };

/**
 * Local durable step replay harness for testing queue jobs without external transport.
 * Checkpoints cross a JSON boundary, retriable step errors retry once before
 * persisting failure (allowing user try/catch to observe only exhausted step failures),
 * and delayed continuations are recorded without waiting.
 */
export function queueReplay(
  job: RegisteredQueueJob | { id?: string; run?: (context: JobContext) => Promise<unknown> },
  event: { name: string; data: Record<string, unknown> },
  options?: { onEnqueue?: (event: QueueEvent) => Promise<unknown> | unknown },
) {
  const state: Record<string, Memo> = {};
  const failures = new Map<string, number>();
  const trace: Array<{ id: string; op: string; name?: string }> = [];
  const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));

  const runner = "run" in job && typeof job.run === "function" ? job.run : null;
  if (!runner) {
    throw new Error("QUEUE_REPLAY_RUNNER_REQUIRED");
  }

  async function run(): Promise<unknown> {
    const step: JobContext["step"] = {
      async run<T>(id: string, execute: () => Promise<T>): Promise<T> {
        if (Object.hasOwn(state, id)) {
          const memo = state[id];
          if (memo.error !== undefined) {
            const errObj = memo.error as { message?: string; name?: string };
            const replayed = new Error(errObj?.message ?? "Step failed");
            if (errObj?.name) replayed.name = errObj.name;
            throw replayed;
          }
          return (memo.data === undefined ? undefined : json(memo.data)) as T;
        }
        while (true) {
          try {
            const data = await execute();
            trace.push({ id, op: "StepRun", name: id });
            const serialized = data === undefined ? undefined : json(data);
            state[id] = { id, data: serialized };
            return serialized as T;
          } catch (error) {
            const count = (failures.get(id) ?? 0) + 1;
            failures.set(id, count);
            trace.push({ id, op: count < 2 ? "StepError" : "StepFailed", name: id });
            if (count < 2) {
              continue;
            }
            const serialized =
              error instanceof Error
                ? { name: error.name, message: error.message }
                : { name: "Error", message: String(error) };
            state[id] = { id, error: json(serialized) };
            throw error;
          }
        }
      },
      async enqueueTask(id: string, next: QueueEvent): Promise<unknown> {
        const delayKey = `${id}-delay`;
        if (next.delaySeconds && !Object.hasOwn(state, delayKey)) {
          trace.push({ id: delayKey, op: "Sleep", name: delayKey });
          state[delayKey] = { id: delayKey, data: null };
        }
        if (Object.hasOwn(state, id)) {
          return json(state[id].data);
        }
        trace.push({ id, op: "EnqueueTask", name: next.name });
        const result = options?.onEnqueue
          ? await options.onEnqueue(next)
          : { ids: [next.id ?? `${id}-enqueued`] };
        state[id] = { id, data: json(result ?? null) };
        return result;
      },
    };

    return runner({ event: { data: event.data }, step });
  }

  return { run, trace, failures, state };
}
