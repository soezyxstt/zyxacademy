import { sql } from "drizzle-orm";
import { queueTaskCheckpoints as checkpoints } from "@/db/schema";

// PostgreSQL serializes concurrent claimants on this environment's single row.
// Re-entry with the same cycle lets a queued job resume its own admission.
export async function claimLatencyCycle(cycle: string, enqueue?: () => Promise<unknown>, resumeOnly = false): Promise<boolean> {
  const { db } = await import("@/db");
  return db.transaction(async tx => {
    const [claim] = await tx.insert(checkpoints).values({
      task: "system:ai-model-latency", step: "cooldown", value: { cycle, state: "running" },
    }).onConflictDoUpdate({
      target: [checkpoints.task, checkpoints.step],
      set: {
        value: { cycle, state: "running" },
        recordedAt: sql`now()`,
      },
      setWhere: sql`(${checkpoints.value}->>'state' = 'running' and
          (${checkpoints.value}->>'cycle' = ${cycle} or (${!resumeOnly} and ${checkpoints.recordedAt} <= now() - interval '2 hours')))
          or (${!resumeOnly} and (${checkpoints.value}->>'state' is null or (${checkpoints.value}->>'state' = 'complete' and
          ${checkpoints.recordedAt} <= now() - interval '3 hours')))`,
    }).returning({ task: checkpoints.task });
    if (!claim) return false;
    await enqueue?.();
    return true;
  });
}

export async function completeLatencyCycle(cycle: string) {
  const { db } = await import("@/db");
  await db.update(checkpoints).set({ value: { cycle, state: "complete" }, recordedAt: sql`now()` })
    .where(sql`${checkpoints.task} = 'system:ai-model-latency' and ${checkpoints.step} = 'cooldown'
      and ${checkpoints.value}->>'cycle' = ${cycle} and ${checkpoints.value}->>'state' = 'running'`);
}
