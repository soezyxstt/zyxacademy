import "server-only";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { auditMutasi, pkaAnnouncements } from "@/db/schema";
import { revisionOf } from "@/lib/admin-mcp/revision";
import { createPkaScheduleRecord, deletePkaScheduleRecord, pkaAnnouncementState, updatePkaAnnouncementState } from "@/lib/pka/lifecycle";
import { lockPkaSchedule, pkaScheduleRevision } from "@/lib/pka/schedule-update";
import { pkaScheduleCreationNeedsDelivery, type PkaLifecycleCommand, type PkaLifecycleReceipt } from "@/packages/academic/pka-lifecycle";
import { assertNativeAdminTransaction, postgresCode, type NativeAdminViewer } from "./admin-transaction";

const entityType = "native_pka_lifecycle";

export async function writeNativePkaLifecycle(command: PkaLifecycleCommand, requestId: string, viewer: NativeAdminViewer) {
  const actorId = viewer.user.id;
  const requestScope = revisionOf({ actorId, sessionId: viewer.session.id, requestId });
  const receiptId = `native_pka_lifecycle_${requestScope}`;
  const inputHash = revisionOf(command);
  const id = command.action === "create-schedule" ? `native-pka-${requestScope}` : command.id;

  function write(): Promise<PkaLifecycleReceipt> {
    return db.transaction(async tx => {
      await assertNativeAdminTransaction(tx, viewer, "update");
      const [receipt] = await tx.select().from(auditMutasi).where(eq(auditMutasi.id, receiptId)).limit(1);
      if (receipt) {
        if (receipt.actorId !== actorId || receipt.entityType !== entityType || receipt.entityId !== id ||
          receipt.action !== command.action || receipt.afterSnapshot?.inputHash !== inputHash) throw new Error("REQUEST_CONFLICT");
        return { status: "saved", id };
      }

      if (command.action === "create-schedule") {
        const sessionAt = new Date(command.sessionAt);
        if (pkaScheduleCreationNeedsDelivery(sessionAt)) throw new Error("WEB_DELIVERY_REQUIRED");
        await createPkaScheduleRecord(tx, { id, title: command.title, sessionAt, meetLink: command.meetLink, createdBy: actorId });
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
        outcome: "success", afterSnapshot: { inputHash },
      });
      return { status: "saved", id };
    });
  }

  const result = await write().catch((error: unknown) => {
    const code = postgresCode(error);
    if (code !== "23505" && code !== "40001" && code !== "40P01") throw error;
    return write();
  });
  if (result.status === "saved") {
    revalidatePath(command.action === "announcement-state" ? "/admin/tutorial-pka/announcements" : "/admin/tutorial-pka/schedules");
    revalidatePath("/courses/tutorial-pka");
    revalidatePath("/courses/tutorial-pka/jadwal");
  }
  return result;
}
