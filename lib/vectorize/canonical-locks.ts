import { sql } from "drizzle-orm";
import type { db } from "@/db";

type Executor = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;
export type CanonicalLock = { domain: "idea" | "product" | "compatibility"; entityType: string; entityId: string };

export function canonicalAdvisoryKey(lock: CanonicalLock): string {
  const prefix = lock.domain === "idea" ? "zyx:idea-canonical:" : lock.domain === "product" ? "zyx:product:" : "zyx:vector-compatibility:";
  return prefix + JSON.stringify([lock.entityType, lock.entityId]);
}

/** Product, Idea, then compatibility locks, each sorted by identity. */
export async function lockCanonicalIdentities(tx: Executor, identities: readonly CanonicalLock[]): Promise<void> {
  const keys = [...new Set(identities.map(canonicalAdvisoryKey))].sort((a, b) => {
    const rank = (key: string) => key.startsWith("zyx:product:") ? 0 : key.startsWith("zyx:idea-canonical:") ? 1 : 2;
    const domain = rank(a) - rank(b);
    return domain || (a < b ? -1 : a > b ? 1 : 0);
  });
  for (const key of keys) await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
}
