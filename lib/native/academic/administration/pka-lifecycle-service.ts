import "server-only";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { auditMutasi, pkaAnnouncements } from "@/db/schema";
import { revisionOf } from "@/lib/admin-mcp/revision";
import { createPkaAnnouncementRecord, createPkaScheduleRecord, deletePkaScheduleRecord, pkaAnnouncementState, updatePkaAnnouncementState } from "@/lib/pka/lifecycle";
import { pkaAnnouncementDeliveryRevision, queueNativePkaDelivery } from "@/lib/pka/native-delivery-queue";
import { lockPkaSchedule, pkaScheduleRevision } from "@/lib/pka/schedule-update";
import { withQueueWakeups } from "@/lib/queue/outbox";
import { pkaScheduleCreationNeedsDelivery, type PkaLifecycleCommand, type PkaLifecycleReceipt } from "@/packages/academic/pka-lifecycle";
import { assertNativeAdminTransaction, postgresCode, type NativeAdminViewer } from "./admin-transaction";

const entityType = "native_pka_lifecycle";

export async function writeNativePkaLifecycle(command: PkaLifecycleCommand, requestId: string, viewer: NativeAdminViewer) {
  const actorId = viewer.user.id;
  const requestScope = revisionOf({ actorId, sessionId: viewer.session.id, requestId });
  const receiptId = `native_pka_lifecycle_${requestScope}`;
  const inputHash = revisionOf(command);
  const id = "id" in command ? command.id : `native-pka-${requestScope}`;

  function write(): Promise<PkaLifecycleReceipt> {
    return withQueueWakeups(() => db.transaction(async tx => {
      await assertNativeAdminTransaction(tx, viewer, "update");
      const [receipt] = await tx.select().from(auditMutasi).where(eq(auditMutasi.id, receiptId)).limit(1);
      if (receipt) {
        if (receipt.actorId !== actorId || receipt.entityType !== entityType || receipt.entityId !== id ||
          receipt.action !== command.action || receipt.afterSnapshot?.inputHash !== inputHash) throw new Error("REQUEST_CONFLICT");
        return { status: "saved", id, ...(receipt.afterSnapshot?.delivery === "queued" ? { delivery: "queued" } : {}) };
      }

      let delivery: "queued" | undefined;
      if (command.action === "create-schedule") {
        const sessionAt = new Date(command.sessionAt);
        const fields = { title: command.title, sessionAt, meetLink: command.meetLink };
        await createPkaScheduleRecord(tx, { id, ...fields, createdBy: actorId });
        if (pkaScheduleCreationNeedsDelivery(sessionAt)) {
          await queueNativePkaDelivery(tx, requestScope, viewer, { kind: "schedule-create", entityId: id, revision: pkaScheduleRevision(id, fields).revision });
          delivery = "queued";
        }
      } else if (command.action === "send-announcement") {
        await createPkaAnnouncementRecord(tx, { id, title: command.title, body: command.body, createdBy: actorId });
        await queueNativePkaDelivery(tx, requestScope, viewer, {
          kind: "announcement", entityId: id, revision: pkaAnnouncementDeliveryRevision(id, command.title, command.body),
        });
        delivery = "queued";
      } else if (command.action === "delete-schedule") {
        const row = await lockPkaSchedule(tx, id);
        if (!row) throw new Error("NOT_FOUND");
        const current = pkaScheduleRevision(id, row);
        if (current.revision !== command.expectedRevision) return { status: "conflict", id, current };
        await deletePkaScheduleRecord(tx, id);
      } else {
        const [announcement] = await tx.select().from(pkaAnnouncements).where(eq(pkaAnnouncements.id, id)).limit(1).for("update");
        if (!announcement) throw new Error("NOT_FOUND");
        const current = pkaAnnouncementState(announcement);
        if (current.revision !== command.expectedRevision) return { status: "conflict", id, current };
        if (current[command.field] !== command.value) await updatePkaAnnouncementState(tx, id, command.field, command.value);
      }

      await tx.insert(auditMutasi).values({
        id: receiptId, actorId, entityType, entityId: id, action: command.action, correlationId: requestId,
        outcome: "success", afterSnapshot: { inputHash, ...(delivery ? { delivery } : {}) },
      });
      return { status: "saved", id, ...(delivery ? { delivery } : {}) };
    }));
  }

  const result = await write().catch((error: unknown) => {
    const code = postgresCode(error);
    if (code !== "23505" && code !== "40001" && code !== "40P01") throw error;
    return write();
  });
  if (result.status === "saved") {
    revalidatePath(command.action === "announcement-state" || command.action === "send-announcement"
      ? "/admin/tutorial-pka/announcements" : "/admin/tutorial-pka/schedules");
    revalidatePath("/courses/tutorial-pka");
    revalidatePath("/courses/tutorial-pka/jadwal");
  }
  return result;
}
