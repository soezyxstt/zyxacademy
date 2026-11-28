import { inngest } from "./client";
import type { QueueEvent } from "@/lib/queue/cloud-tasks";

export interface JobSteps {
  run<T>(id: string, execute: () => Promise<T>): Promise<T>;
  enqueueTask(id: string, event: QueueEvent): Promise<unknown>;
}

export type JobContext = { event: { data: Record<string, unknown> }; step: JobSteps };
type FailureContext = { event: { data: { event: JobContext["event"]; error: { message: string } } } };
type Limit = { limit: number; key?: string };
export type JobDefinition = {
  id: string;
  name?: string;
  triggers: Array<{ event: string } | { cron: string }>;
  retries?: 0 | 1 | 2 | 3 | 4 | 5;
  concurrency?: Limit | [Limit, Limit];
  debounce?: { key: string; period: "30s" };
  singleton?: { key: string; mode: "skip" };
  onFailure?: (context: FailureContext) => Promise<unknown>;
};

export interface RegisteredQueueJob {
  definition: JobDefinition;
  run: (context: JobContext) => Promise<unknown>;
}

export const queueJobs = new Map<string, RegisteredQueueJob>();

export function defineJob(definition: JobDefinition, run: (context: JobContext) => Promise<unknown>) {
  const job: RegisteredQueueJob = { definition, run };
  queueJobs.set(definition.id, job);
  for (const trigger of definition.triggers) {
    if ("event" in trigger) queueJobs.set(trigger.event, job);
  }
  return inngest.createFunction(definition, async ({ event, step }: {
    event?: { data?: Record<string, unknown> };
    step: {
      run: <T>(id: string, execute: () => Promise<T>) => Promise<T>;
      enqueueTask?: (id: string, next: QueueEvent) => Promise<unknown>;
      sendEvent?: (id: string, next: { name: string; data: Record<string, unknown>; id?: string }) => Promise<unknown>;
      sleep?: (id: string, ms: number) => Promise<unknown>;
    };
  }) => run({
    event: { data: event?.data ?? {} },
    step: {
      run: <T>(id: string, execute: () => Promise<T>) => step.run(id, execute),
      enqueueTask: async (id, next) => {
        if (step.enqueueTask) return step.enqueueTask(id, next);
        if (next.delaySeconds && step.sleep) await step.sleep(`${id}-delay`, next.delaySeconds * 1000);
        if (step.sendEvent) return step.sendEvent(id, { name: next.name, data: next.data, id: next.id });
        return inngest.send({
          name: next.name,
          data: next.data,
          id: next.id,
          ts: next.delaySeconds ? Date.now() + next.delaySeconds * 1000 : undefined,
        });
      },
    },
  }));
}
