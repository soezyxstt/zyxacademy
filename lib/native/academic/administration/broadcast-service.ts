import { and, asc, desc, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { adminOperationJobs, courses } from "@/db/schema";
import { revisionOf } from "@/lib/admin-mcp/revision";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { minutesAgo } from "@/lib/date-utils";
import { adminBroadcastAudienceLabel, adminBroadcastCourses, adminBroadcastRecipientIds } from "@/lib/notifications/admin-broadcast-audience";
import { wakeOutbox, withQueueWakeups } from "@/lib/queue/outbox";
import type { BroadcastComposeData, BroadcastDraft, BroadcastReceipt } from "../../../../packages/academic/admin-broadcast";
import { assertNativeAdminTransaction, type NativeAdminViewer } from "@/lib/auth/native-admin-session";

const jobs = adminOperationJobs;
type Job = typeof jobs.$inferSelect;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Snapshot = { draft: BroadcastDraft; audience: string; recipientCount: number; audienceRevision: string };
const reviewMinutes = 15;
const nativeScope = "native-admin:broadcast";
const nativeEnvironment = () => `native-broadcast:${new URL(resolveAuthBaseUrl()).origin}`;
export const NATIVE_BROADCAST_BATCH = 5;

const nativeJob = () => and(
  eq(jobs.environment, nativeEnvironment()),
  eq(jobs.requiredScope, nativeScope),
  eq(jobs.kind, "notification_send"),
);
const ownership = (viewer: NativeAdminViewer) => and(nativeJob(), eq(jobs.actorId, viewer.user.id), eq(jobs.sessionId, viewer.session.id));
const isActive = (status: Job["status"]) => status === "prepared" || status === "queued" || status === "running";
const isExpired = (job: Job) => job.createdAt < minutesAgo(reviewMinutes);
const readSnapshot = (row: Job) => row.payload as Snapshot;

function receipt(row: Job): BroadcastReceipt {
  const { draft, audience, recipientCount } = readSnapshot(row);
  const issue = row.errorCode as BroadcastReceipt["issue"] | null;
  return {
    id: row.id, draft, audience, recipientCount, status: row.status,
    ...(issue ? { issue } : {}),
    ...(row.status === "succeeded" && row.result ? {
      attempted: Number(row.result.attempted),
      succeeded: Number(row.result.succeeded),
      failedCount: Number(row.result.failedCount),
    } : {}),
  };
}

async function current(tx: Transaction, viewer: NativeAdminViewer) {
  const [row] = await tx.select().from(jobs).where(ownership(viewer))
    .orderBy(desc(jobs.createdAt), desc(jobs.id)).limit(1);
  return row;
}

async function finish(tx: Transaction, row: Job, status: "failed" | "cancelled", issue?: BroadcastReceipt["issue"]) {
  const [next] = await tx.update(jobs).set({ status, errorCode: issue ?? null, updatedAt: new Date() })
    .where(and(eq(jobs.id, row.id), nativeJob())).returning();
  return next;
}

export function readNativeBroadcast(viewer: NativeAdminViewer): Promise<BroadcastComposeData> {
  return db.transaction(async tx => {
    await assertNativeAdminTransaction(tx, viewer);
    const row = await current(tx, viewer);
    const lastReceipt = row && row.status !== "cancelled"
      ? receipt(row.status === "prepared" && isExpired(row) ? { ...row, status: "cancelled", errorCode: "preview_expired" } : row)
      : null;
    return { courses: await adminBroadcastCourses(tx).orderBy(asc(courses.title), asc(courses.id)), receipt: lastReceipt };
  });
}

export function prepareNativeBroadcast(viewer: NativeAdminViewer, id: string, draft: BroadcastDraft) {
  return db.transaction(async tx => {
    // Serialize the session's prepare/confirm/discard transitions, including concurrent prepares.
    await assertNativeAdminTransaction(tx, viewer, "update");
    const [previous] = await tx.select().from(jobs).where(and(ownership(viewer), eq(jobs.id, id))).limit(1);
    if (previous) {
      if (revisionOf(readSnapshot(previous).draft) !== revisionOf(draft)) throw new Error("REQUEST_CONFLICT");
      return receipt(previous);
    }
    const latest = await current(tx, viewer);
    if (latest && isActive(latest.status)) {
      if (latest.status !== "prepared" || !isExpired(latest)) return receipt(latest);
      await finish(tx, latest, "cancelled", "preview_expired");
    }

    const audience = await adminBroadcastAudienceLabel(tx, draft);
    const recipientIds = await adminBroadcastRecipientIds(tx, draft.target, draft.targetId);
    if (!audience || recipientIds.length === 0) throw new Error("EMPTY_AUDIENCE");
    const now = new Date(Math.max(Date.now(), (latest?.createdAt.getTime() ?? 0) + 1));
    const payload: Snapshot = { draft, audience, recipientCount: recipientIds.length, audienceRevision: revisionOf(recipientIds) };
    const [created] = await tx.insert(jobs).values({
      id, actorId: viewer.user.id, sessionId: viewer.session.id, kind: "notification_send",
      requiredScope: nativeScope, environment: nativeEnvironment(),
      status: "prepared", payload, createdAt: now, updatedAt: now,
    }).onConflictDoNothing().returning();
    if (!created) throw new Error("REQUEST_CONFLICT");
    return receipt(created);
  });
}

export function transitionNativeBroadcast(viewer: NativeAdminViewer, id: string, action: "confirm" | "discard") {
  return withQueueWakeups(() => db.transaction(async tx => {
    await assertNativeAdminTransaction(tx, viewer, "update");
    const [row] = await tx.select().from(jobs).where(and(ownership(viewer), eq(jobs.id, id))).limit(1).for("update");
    if (!row) throw new Error("NOT_FOUND");
    if (row.status !== "prepared") return receipt(row);
    if (isExpired(row)) return receipt(await finish(tx, row, "cancelled", "preview_expired"));
    if (action === "discard") return receipt(await finish(tx, row, "cancelled"));

    const snapshot = readSnapshot(row);
    const ids = await adminBroadcastRecipientIds(tx, snapshot.draft.target, snapshot.draft.targetId);
    if (revisionOf(ids) !== snapshot.audienceRevision) return receipt(await finish(tx, row, "failed", "audience_changed"));
    const [queued] = await tx.update(jobs).set({ status: "queued", updatedAt: new Date() })
      .where(and(eq(jobs.id, id), nativeJob())).returning();
    wakeOutbox("admin/operations.continue");
    return receipt(queued);
  }));
}

export async function collectNativeBroadcasts() {
  await db.update(jobs).set({ status: "unknown", errorCode: "delivery_uncertain", updatedAt: new Date() })
    .where(and(nativeJob(), eq(jobs.status, "running"), lt(jobs.updatedAt, minutesAgo(15))));
  return db.select({ id: jobs.id }).from(jobs).where(and(nativeJob(), eq(jobs.status, "queued")))
    .orderBy(asc(jobs.createdAt), asc(jobs.id)).limit(NATIVE_BROADCAST_BATCH);
}

export async function processNativeBroadcast(id: string) {
  // Check authority and commit a durable claim before any inbox or push effect.
  const claimed = await db.transaction(async tx => {
    const [row] = await tx.select().from(jobs).where(and(nativeJob(), eq(jobs.id, id), eq(jobs.status, "queued"))).limit(1);
    if (!row) return;
    const viewer = { user: { id: row.actorId }, session: { id: row.sessionId } };
    // Lock the session before locking the job, in the same order as interactive transitions.
    let authorized = true;
    try {
      await assertNativeAdminTransaction(tx, viewer);
    } catch (error) {
      if (!(error instanceof Error) || (error.message !== "UNAUTHENTICATED" && error.message !== "FORBIDDEN")) throw error;
      authorized = false;
    }
    const [pending] = await tx.select({ id: jobs.id }).from(jobs)
      .where(and(nativeJob(), eq(jobs.id, id), eq(jobs.status, "queued"))).limit(1).for("update");
    if (!pending) return;
    if (!authorized) {
      await finish(tx, row, "failed", "authorization_expired");
      return;
    }
    const snapshot = readSnapshot(row);
    const ids = await adminBroadcastRecipientIds(tx, snapshot.draft.target, snapshot.draft.targetId);
    if (revisionOf(ids) !== snapshot.audienceRevision) {
      await finish(tx, row, "failed", "audience_changed");
      return;
    }
    await tx.update(jobs).set({ status: "running", updatedAt: new Date() }).where(and(nativeJob(), eq(jobs.id, id)));
    return { draft: snapshot.draft, recipientIds: ids };
  });
  if (!claimed) return { id, claimed: false };

  const running = and(nativeJob(), eq(jobs.id, id), eq(jobs.status, "running"));
  const touch = () => db.update(jobs).set({ updatedAt: new Date() }).where(running);
  const heartbeat = setInterval(() => void touch().catch(() => {}), 60000);
  try {
    const { sendAdminBroadcast } = await import("@/lib/notifications/send");
    const { title, body, link } = claimed.draft;
    const result = await sendAdminBroadcast(title, body, link, claimed.recipientIds);
    await db.update(jobs).set({
      status: "succeeded", updatedAt: new Date(),
      errorCode: result.errors.length || result.failedTokens.length ? "partial" : null,
      result: { attempted: result.attempted, succeeded: result.succeeded, failedCount: result.failedTokens.length },
    }).where(running);
  } catch {
    // This attempt may already have sent some or all of the snapshot. Never replay it.
    await db.update(jobs).set({ status: "unknown", errorCode: "delivery_uncertain", updatedAt: new Date() }).where(running);
  } finally {
    clearInterval(heartbeat);
  }
  return { id, claimed: true };
}
