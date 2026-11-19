import { inngest } from "./client";
import type { QueueEvent } from "@/lib/queue/cloud-tasks";

export interface JobSteps {
  run<T>(id: string, execute: () => Promise<T>): Promise<T>;
  enqueueTask(id: string, event: QueueEvent): Promise<unknown>;
}

type JobContext = { event: { data: Record<string, unknown> }; step: JobSteps };
type FailureContext = { event: { data: { event: JobContext["event"]; error: { message: string } } } };
type Limit = { limit: number; key?: string };
type Definition = {
  id: string;
  name?: string;
  triggers: Array<{ event: string } | { cron: string }>;
  retries?: 0 | 1 | 2 | 3 | 4 | 5;
  concurrency?: Limit | [Limit, Limit];
  debounce?: { key: string; period: "30s" };
  singleton?: { key: string; mode: "skip" };
  onFailure?: (context: FailureContext) => Promise<unknown>;
};
export const queueJobs = new Map<string, { definition: Definition; run: (context: JobContext) => Promise<unknown> }>();

export function defineJob(definition: Definition, run: (context: JobContext) => Promise<unknown>) {
  const job = { definition, run };
  queueJobs.set(definition.id, job);
  for (const trigger of definition.triggers) {
    if ("event" in trigger) queueJobs.set(trigger.event, job);
  }
  return inngest.createFunction(definition, async ({ event, step }) => run({
    event: { data: event?.data ?? {} },
    step: {
      // Legacy Inngest serializes results at a step boundary.
      run: <T>(id: string, execute: () => Promise<T>) => step.run(id, execute) as Promise<T>,
      enqueueTask: async (id, next) => {
        if (next.delaySeconds) await step.sleep(`${id}-delay`, next.delaySeconds * 1000);
        return step.sendEvent(id, { name: next.name, data: next.data, id: next.id });
      },
    },
  }));
}
