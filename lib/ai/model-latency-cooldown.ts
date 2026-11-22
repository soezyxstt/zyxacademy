import { sql } from "drizzle-orm";
import { queueTaskCheckpoints as checkpoints } from "@/db/schema";

// PostgreSQL serializes concurrent claimants on this environment's single row.
// Re-entry with the same cycle lets a queued job resume its own admission.
export async function claimLatencyCycle(cycle: string, enqueue?: () => Promise<unknown>): Promise<boolean> {
  const { db } = await import("@/db");
  return db.transaction(async tx => {
    const [claim] = await tx.insert(checkpoints).values({
      task: "system:ai-model-latency", step: "cooldown", value: { cycle },
    }).onConflictDoUpdate({
      target: [checkpoints.task, checkpoints.step],
      set: {
        value: { cycle },
        recordedAt: sql`case when ${checkpoints.value}->>'cycle' = ${cycle} then ${checkpoints.recordedAt} else now() end`,
      },
      setWhere: sql`${checkpoints.value}->>'cycle' = ${cycle} or ${checkpoints.recordedAt} <= now() - interval '3 hours'`,
    }).returning({ task: checkpoints.task });
    if (!claim) return false;
    await enqueue?.();
    return true;
  });
}
