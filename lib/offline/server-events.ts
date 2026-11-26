import { and, asc, eq, gt, gte, inArray, lt, lte, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import { db } from "@/db";
import { offlineCachePolicy, offlineContentChanges, offlineSyncState } from "@/db/schema";
import { assertAuthoringActor } from "@/lib/auth/authoring-actor";
import { DEFAULT_OFFLINE_POLICY, offlinePolicySettingsSchema, type OfflineChange, type OfflinePolicy, type OfflinePolicySettings } from "./sync-contract";

/** SQL builders are schema-independent. Avoid expanding all relational query
 * types when this small transactional writer is used by many domain services. */
export type OfflineTransaction = Pick<PgDatabase<NodePgQueryResultHKT>, "select" | "insert" | "update" | "delete" | "execute">;
export type OfflineChangeInput = Omit<OfflineChange, "cursor" | "resourceId" | "courseId" | "revision"> & { resourceId?: string | null; courseId?: string | null; revision?: string | null; userId?: string | null };

/** Must run inside the same transaction as the mutation, never after commit.
 * UPDATE takes a row lock until COMMIT. A later writer cannot allocate a cursor
 * before this transaction commits or rolls back, unlike a PostgreSQL sequence.
 */
export async function recordOfflineChange(tx: Pick<OfflineTransaction, "insert" | "update">, input: OfflineChangeInput): Promise<string> {
  await tx.insert(offlineSyncState).values({ id: "default" }).onConflictDoNothing();
  const [state] = await tx.update(offlineSyncState).set({ cursor: sql`${offlineSyncState.cursor} + 1`, updatedAt: new Date() }).where(eq(offlineSyncState.id, "default")).returning();
  await tx.insert(offlineContentChanges).values({ cursor: state.cursor, courseId: input.courseId ?? null, userId: input.userId ?? null, kind: input.kind, resourceId: input.resourceId ?? null, action: input.action, revision: input.revision ?? null });
  return state.cursor.toString();
}

export async function currentOfflineCursor(connection: Pick<OfflineTransaction, "select"> = db): Promise<string> {
  const [row] = await connection.select({ cursor: offlineSyncState.cursor }).from(offlineSyncState).where(eq(offlineSyncState.id, "default")).limit(1);
  return row?.cursor.toString() ?? "0";
}

export async function readOfflinePolicy(): Promise<OfflinePolicy> {
  const [row] = await db.select().from(offlineCachePolicy).where(eq(offlineCachePolicy.id, "default")).limit(1);
  if (!row) return { ...DEFAULT_OFFLINE_POLICY, schedule: { ...DEFAULT_OFFLINE_POLICY.schedule } };
  return { ...offlinePolicySettingsSchema.parse(row.settings), revision: row.revision, updatedAt: row.updatedAt.getTime() };
}

export async function writeOfflinePolicy(actorId: string, expectedRevision: number, settings: OfflinePolicySettings): Promise<OfflinePolicy> {
  const parsed = offlinePolicySettingsSchema.parse(settings);
  return db.transaction(async tx => {
    await assertAuthoringActor(tx, actorId, { roles: ["admin"], lock: true, error: "OFFLINE_ADMIN_REQUIRED" });
    // Serialize first publication and subsequent policy updates with the event cursor.
    await tx.insert(offlineSyncState).values({ id: "default" }).onConflictDoNothing();
    await tx.select({ id: offlineSyncState.id }).from(offlineSyncState).where(eq(offlineSyncState.id, "default")).for("update");
    const [before] = await tx.select().from(offlineCachePolicy).where(eq(offlineCachePolicy.id, "default")).for("update");
    if ((before?.revision ?? 0) !== expectedRevision) throw new Error("OFFLINE_POLICY_CONFLICT");
    const now = new Date();
    const revision = expectedRevision + 1;
    await tx.insert(offlineCachePolicy).values({ id: "default", revision, settings: parsed, updatedBy: actorId, updatedAt: now }).onConflictDoUpdate({ target: offlineCachePolicy.id, set: { revision, settings: parsed, updatedBy: actorId, updatedAt: now } });
    await recordOfflineChange(tx, { kind: "policy", action: "invalidate", revision: String(revision) });
    return { ...parsed, revision, updatedAt: now.getTime() };
  });
}

/** Cursor advances across invisible rows too; otherwise one busy private scope stalls other clients. */
export async function readOfflineChanges(accountId: string, courseIds: string[], cursor: string | null, limit = 200): Promise<{ cursor: string; reset: boolean; hasMore: boolean; changes: OfflineChange[] }> {
  return db.transaction(async tx => {
    const head = await currentOfflineCursor(tx);
    const [first] = await tx.select({ cursor: offlineContentChanges.cursor }).from(offlineContentChanges).orderBy(asc(offlineContentChanges.cursor)).limit(1);
    const after = cursor === null ? 0n : BigInt(cursor);
    const reset = cursor === null || after > BigInt(head) || (first ? after < first.cursor - 1n : after < BigInt(head));
    if (reset) return { cursor: head, reset: true, hasMore: false, changes: [] };
    const rows = await tx.select().from(offlineContentChanges).where(and(gt(offlineContentChanges.cursor, after), lte(offlineContentChanges.cursor, BigInt(head)))).orderBy(asc(offlineContentChanges.cursor)).limit(limit + 1);
    const page = rows.slice(0, limit);
    const scopes = new Set(courseIds);
    const visible = page.filter(row => row.userId === accountId || (row.userId === null && (row.courseId === null || scopes.has(row.courseId))));
    return { cursor: rows.length > limit ? page[page.length - 1]!.cursor.toString() : head, reset: false, hasMore: rows.length > limit, changes: visible.map(row => ({ cursor: row.cursor.toString(), kind: row.kind, resourceId: row.resourceId, courseId: row.courseId, action: row.action, revision: row.revision })) };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export const OFFLINE_CHANGE_RETENTION_MS = 90 * 86_400_000;

/** Remove only a contiguous cursor prefix. Wall-clock timestamps can be out of
 * cursor order when a long transaction waits for the commit-order lock. */
export async function pruneOfflineChanges(now = new Date(), limit = 1000): Promise<{ removed: number; hasMore: boolean }> {
  const bounded = Math.max(1, Math.min(1000, Math.floor(limit)));
  return db.transaction(async tx => {
    const head = BigInt(await currentOfflineCursor(tx));
    const [firstFresh] = await tx.select({ cursor: offlineContentChanges.cursor }).from(offlineContentChanges).where(gte(offlineContentChanges.createdAt, new Date(now.getTime() - OFFLINE_CHANGE_RETENTION_MS))).orderBy(asc(offlineContentChanges.cursor)).limit(1);
    // Keep the most recent committed event even when the entire log is old.
    const boundary = firstFresh?.cursor ?? head;
    const rows = await tx.select({ cursor: offlineContentChanges.cursor }).from(offlineContentChanges).where(lt(offlineContentChanges.cursor, boundary)).orderBy(asc(offlineContentChanges.cursor)).limit(bounded + 1);
    const page = rows.slice(0, bounded);
    if (page.length) await tx.delete(offlineContentChanges).where(inArray(offlineContentChanges.cursor, page.map(row => row.cursor)));
    return { removed: page.length, hasMore: rows.length > bounded };
  });
}

export async function offlinePolicyStatus() {
  const [state] = await db.select().from(offlineSyncState).where(eq(offlineSyncState.id, "default")).limit(1);
  return { cursor: state?.cursor.toString() ?? "0", lastChangedAt: state?.updatedAt.getTime() ?? null };
}
