import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminOperationJobs, pkaAnnouncements, pkaSchedules } from "@/db/schema";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { assertNativeAdminTransaction, type NativeAdminViewer } from "@/lib/auth/native-admin-session";
import { wakeOutbox } from "@/lib/queue/outbox";
import { revisionOf } from "@/lib/admin-mcp/revision";
import type { PkaDeliveryKind, PkaDeliveryStatus } from "@/packages/academic/pka-delivery";
import type { PkaDelivery } from "./delivery";
import { lockPkaSchedule, pkaScheduleRevision } from "./schedule-update";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Job = typeof adminOperationJobs.$inferSelect;
type Payload = { kind: PkaDeliveryKind; entityId: string; revision: string };
const jobs = adminOperationJobs;
const scope = "native-product:pka-delivery";
const pendingWindow = 15 * 60 * 1000;
const environment = () => `native-pka:${new URL(resolveAuthBaseUrl()).origin}`;
export const pkaDeliveryOutbox = "pka/delivery.continue";
export const pkaDeliveryJob = "pka-native-delivery";
export const pkaDeliveryBatch = 3;

function deliveryScope() {
  return and(eq(jobs.requiredScope, scope), eq(jobs.environment, environment()), eq(jobs.kind, "notification_send"));
}

function readPayload(job: Job): Payload | null {
  const { kind, entityId, revision } = job.payload;
  if ((kind !== "announcement" && kind !== "schedule-create" && kind !== "schedule-update") ||
    typeof entityId !== "string" || !entityId || typeof revision !== "string") return null;
  return { kind, entityId, revision };
}

export const pkaAnnouncementDeliveryRevision = (id: string, title: string, body: string) => revisionOf({ id, title, body });

export async function queueNativePkaDelivery(tx: Transaction, id: string, viewer: NativeAdminViewer, payload: Payload) {
  const now = new Date();
  await tx.insert(jobs).values({
    id: `${pkaDeliveryJob}:${id}`, actorId: viewer.user.id, sessionId: viewer.session.id,
    kind: "notification_send", requiredScope: scope, environment: environment(),
    payload, status: "queued", createdAt: now, updatedAt: now,
  });
  wakeOutbox(pkaDeliveryOutbox);
}

export async function readPkaDeliveryStatuses(ids: string[], section: "announcements" | "sessions") {
  const result = new Map<string, PkaDeliveryStatus>();
  if (!ids.length) return result;
  const rows = await db.select().from(jobs).where(and(deliveryScope(),
    inArray(sql<string>`${jobs.payload}->>'entityId'`, ids),
    inArray(sql<string>`${jobs.payload}->>'kind'`, section === "announcements" ? ["announcement"] : ["schedule-create", "schedule-update"]),
  )).orderBy(desc(jobs.createdAt), desc(jobs.id));
  for (const row of rows) {
    const payload = readPayload(row);
    if (!payload || result.has(payload.entityId) || row.status === "prepared" || row.status === "cancelled") continue;
    if (row.status === "running" && row.updatedAt.getTime() < Date.now() - pendingWindow) result.set(payload.entityId, "unknown");
    else if (row.status === "succeeded" && row.errorCode === "partial_delivery") result.set(payload.entityId, "partial");
    else result.set(payload.entityId, row.status);
  }
  return result;
}

export async function collectNativePkaDelivery() {
  const staleBefore = new Date(Date.now() - pendingWindow);
  await db.update(jobs).set({ status: "unknown", errorCode: "delivery_uncertain", updatedAt: new Date() })
    .where(and(deliveryScope(), eq(jobs.status, "running"), lt(jobs.updatedAt, staleBefore)));
  return db.select({ id: jobs.id }).from(jobs).where(and(deliveryScope(), eq(jobs.status, "queued")))
    .orderBy(asc(jobs.createdAt), asc(jobs.id)).limit(pkaDeliveryBatch);
}

async function target(tx: Transaction, payload: Payload): Promise<PkaDelivery | null> {
  if (payload.kind === "announcement") {
    const [row] = await tx.select().from(pkaAnnouncements).where(eq(pkaAnnouncements.id, payload.entityId)).limit(1).for("update");
    if (!row || row.isArchived || row.sentAt || pkaAnnouncementDeliveryRevision(row.id, row.title, row.body) !== payload.revision) return null;
    return { kind: payload.kind, title: row.title, body: row.body };
  }
  const row = await lockPkaSchedule(tx, payload.entityId);
  if (!row || row.sessionAt.getTime() <= Date.now() || pkaScheduleRevision(row.id, row).revision !== payload.revision ||
    (payload.kind === "schedule-create" && row.sentAt)) return null;
  return { kind: payload.kind, title: row.title, sessionAt: row.sessionAt, meetLink: row.meetLink };
}

async function claim(id: string) {
  return db.transaction(async tx => {
    const [job] = await tx.select().from(jobs)
      .where(and(deliveryScope(), eq(jobs.id, id), eq(jobs.status, "queued"))).limit(1);
    if (!job) return null;
    let authorized = true;
    try {
      await assertNativeAdminTransaction(tx, { user: { id: job.actorId }, session: { id: job.sessionId } });
    } catch (error) {
      if (!(error instanceof Error) || !["FORBIDDEN", "UNAUTHENTICATED"].includes(error.message)) throw error;
      authorized = false;
    }
    const [pending] = await tx.select({ id: jobs.id }).from(jobs)
      .where(and(deliveryScope(), eq(jobs.id, id), eq(jobs.status, "queued"))).limit(1).for("update");
    if (!pending) return null;
    const payload = readPayload(job);
    const message = authorized && payload ? await target(tx, payload) : null;
    if (!message || !payload) {
      await tx.update(jobs).set({ status: "failed", errorCode: authorized ? "target_changed" : "authorization_expired", updatedAt: new Date() })
        .where(and(deliveryScope(), eq(jobs.id, id)));
      return null;
    }
    await tx.update(jobs).set({ status: "running", updatedAt: new Date() }).where(and(deliveryScope(), eq(jobs.id, id)));
    return { payload, message };
  });
}

export async function processNativePkaDelivery(id: string) {
  // A durable claim precedes external delivery. A lost outcome is reported as unknown and never replayed.
  const claimed = await claim(id);
  if (!claimed) return { claimed: false };
  const running = and(deliveryScope(), eq(jobs.id, id), eq(jobs.status, "running"));
  const heartbeat = setInterval(() => {
    void db.update(jobs).set({ updatedAt: new Date() }).where(running).catch(() => {});
  }, 60000);
  try {
    const { deliverPkaMessage } = await import("./delivery");
    const result = await deliverPkaMessage(claimed.message);
    await db.transaction(async tx => {
      const now = new Date();
      const [recorded] = await tx.update(jobs).set({
        status: "succeeded", updatedAt: now, result,
        errorCode: result.failedCount ? "partial_delivery" : null,
      }).where(running).returning({ id: jobs.id });
      if (!recorded) return;
      const { kind, entityId } = claimed.payload;
      const progress = { sentAt: now, recipientCount: result.recipientCount };
      if (kind === "announcement") await tx.update(pkaAnnouncements).set(progress).where(eq(pkaAnnouncements.id, entityId));
      if (kind === "schedule-create") await tx.update(pkaSchedules).set(progress).where(eq(pkaSchedules.id, entityId));
    });
  } catch {
    await db.update(jobs).set({ status: "unknown", errorCode: "delivery_uncertain", updatedAt: new Date() }).where(running);
  } finally {
    clearInterval(heartbeat);
  }
  return { claimed: true };
}
