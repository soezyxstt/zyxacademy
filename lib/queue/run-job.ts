import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { queueTaskCheckpoints } from "@/db/schema";
import { queueJobs, type JobSteps } from "@/jobs/define-job";
import { enqueueTask } from "./cloud-tasks";

export async function runQueueJob(name: string, data: Record<string, unknown>, task: string, retry: number, maxAttempts: number) {
  const job = queueJobs.get(name);
  if (!job) throw new Error("QUEUE_JOB_UNKNOWN");
  // Transaction-scoped locks work through the pooled Neon endpoint. Completed
  // steps commit independently so a later step failing cannot undo their journal.
  return db.transaction(async tx => {
    const lock = async (key: string) => (await tx.execute<{ acquired: boolean }>(
      sql`select pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) as acquired`,
    )).rows[0]?.acquired;
    if (!await lock(`queue:task:${task}`)) throw new Error("QUEUE_JOB_BUSY");
    const rows = await db.select().from(queueTaskCheckpoints).where(eq(queueTaskCheckpoints.task, task));
    const completed = new Map(rows.map(row => [row.step, row.value as { result?: unknown }]));
    if (completed.has("$done")) return;
    if (job.definition.id === "google-calendar-sync") {
      if (typeof data.target !== "string") throw new Error("QUEUE_CALENDAR_TARGET_REQUIRED");
      if (!await lock(`queue:google-calendar:${data.target}`)) throw new Error("QUEUE_JOB_BUSY");
    }
    if (job.definition.id === "pdf-thumbnail-worker") {
      if (!await lock(`queue:thumbnail:${data.sourceType}:${data.materialId}`)) return;
      if (!await lock(`queue:material:${data.materialId}`)) throw new Error("QUEUE_JOB_BUSY");
    }
    const record = async (step: string, result: unknown) => {
      const value = result === undefined ? {} : { result };
      await db.insert(queueTaskCheckpoints).values({ task, step, value });
      completed.set(step, value);
    };
    const steps: JobSteps = {
      async run<T>(id: string, execute: () => Promise<T>) {
        const key = "step:" + id;
        if (completed.has(key)) return completed.get(key)?.result as T;
        const result = await execute();
        await record(key, result);
        return result;
      },
      enqueueTask(id, event) {
        return enqueueTask({ ...event, id: event.id ?? `${task}:${id}` });
      },
    };
    let status = "completed";
    try {
      await job.run({ event: { data }, step: steps });
    } catch (error) {
      if (retry < Math.min(job.definition.retries ?? 4, maxAttempts - 1)) throw error;
      status = "failed";
      console.warn(JSON.stringify({ event: "queue.retries_exhausted", job: job.definition.id, retry }));
      await job.definition.onFailure?.({ event: { data: { event: { data }, error: {
        message: error instanceof Error ? error.message : "QUEUE_JOB_FAILED",
      } } } });
    }
    await record("$done", status);
    await db.delete(queueTaskCheckpoints).where(and(eq(queueTaskCheckpoints.task, task), sql`${queueTaskCheckpoints.step} <> '$done'`));
  });
}
