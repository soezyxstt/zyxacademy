import { sql } from "drizzle-orm";
import type { db } from "@/db";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function lockScheduleEntity(tx: Transaction, kind: "tutor" | "ticket", id: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`zyx:schedule:${kind}:${id}`}, 0))`);
}
