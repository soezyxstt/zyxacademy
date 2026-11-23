import { eq, sql } from "drizzle-orm";
import { queueTaskCheckpoints as checkpoints } from "@/db/schema";

const task = "system:ai-request-latency";
export type RequestLatency = { checkedAt: number; samples: number[] };

export async function recordRequestLatency(model: string, latencyMs: number) {
  if (!Number.isFinite(latencyMs) || latencyMs < 0 || !process.env.DATABASE_URL) return;
  const { db } = await import("@/db");
  await db.insert(checkpoints).values({ task, step: model, value: [latencyMs] })
    .onConflictDoUpdate({
      target: [checkpoints.task, checkpoints.step],
      set: {
        value: sql`(select jsonb_agg(sample order by position) from
          (select sample, position from jsonb_array_elements(${checkpoints.value} || excluded.value)
            with ordinality as history(sample, position) order by position desc limit 10) recent)`,
        recordedAt: sql`clock_timestamp()`,
      },
    });
}

export async function readRequestLatencies(): Promise<Record<string, RequestLatency>> {
  if (!process.env.DATABASE_URL) return {};
  const { db } = await import("@/db");
  const rows = await db.select().from(checkpoints).where(eq(checkpoints.task, task));
  return Object.fromEntries(rows.map(row => [row.step, { samples: row.value as number[], checkedAt: row.recordedAt.getTime() }]));
}

