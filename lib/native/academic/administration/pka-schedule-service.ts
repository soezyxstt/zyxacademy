import "server-only";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditMutasi } from "@/db/schema";
import { revisionOf } from "@/lib/admin-mcp/revision";
import { lockPkaSchedule, pkaScheduleDeliveryRequired, pkaScheduleRevision, updatePkaSchedule } from "@/lib/pka/schedule-update";
import { isPkaScheduleRevision, type PkaScheduleEdit, type PkaScheduleRevision } from "@/packages/academic/pka-schedule-edit";
import { assertNativeAdminTransaction, postgresCode, type NativeAdminViewer } from "./admin-transaction";

export type NativePkaScheduleResult = { status: "saved" | "conflict"; schedule: PkaScheduleRevision };
const auditType = "native_pka_schedule";
const meetLinkSchema = z.url({ protocol: /^https$/ });

export async function updateNativePkaSchedule(id: string, draft: PkaScheduleEdit, requestId: string, viewer: NativeAdminViewer) {
  const actorId = viewer.user.id;
  const receiptId = `native_pka_schedule_${revisionOf({ actorId, sessionId: viewer.session.id, requestId })}`;
  const inputHash = revisionOf({ id, draft });
  const fields = { title: draft.title, meetLink: draft.meetLink, sessionAt: new Date(draft.sessionAt) };

  function write(): Promise<NativePkaScheduleResult> {
    return db.transaction(async (tx) => {
      await assertNativeAdminTransaction(tx, viewer);
      const existing = await lockPkaSchedule(tx, id);
      if (!existing) throw new Error("NOT_FOUND");
      const [receipt] = await tx.select().from(auditMutasi).where(eq(auditMutasi.id, receiptId)).limit(1);
      if (receipt) {
        const result = receipt.afterSnapshot?.result;
        if (receipt.actorId !== actorId || receipt.entityType !== auditType || receipt.entityId !== id
          || receipt.action !== "update_schedule" || receipt.afterSnapshot?.inputHash !== inputHash
          || !isPkaScheduleRevision(result)) throw new Error("REQUEST_CONFLICT");
        return { status: "saved", schedule: result };
      }
      const current = pkaScheduleRevision(id, existing);
      if (current.revision !== draft.expectedRevision) return { status: "conflict", schedule: current };
      if (fields.meetLink && fields.meetLink !== existing.meetLink && !meetLinkSchema.safeParse(fields.meetLink).success) {
        throw new Error("INVALID_SCHEDULE");
      }
      if (pkaScheduleDeliveryRequired(existing, fields)) throw new Error("WEB_DELIVERY_REQUIRED");
      const next = pkaScheduleRevision(id, fields);
      if (next.revision !== current.revision) await updatePkaSchedule(tx, existing, fields);
      await tx.insert(auditMutasi).values({
        id: receiptId, actorId, entityType: auditType, entityId: id, action: "update_schedule",
        correlationId: requestId, outcome: "success", beforeSnapshot: { expectedRevision: draft.expectedRevision },
        afterSnapshot: { inputHash, result: next },
      });
      return { status: "saved", schedule: next };
    });
  }

  const result = await write().catch((error: unknown) => {
    const code = postgresCode(error);
    if (code !== "23505" && code !== "40001" && code !== "40P01") throw error;
    return write();
  });
  if (result.status === "saved") {
    revalidatePath("/admin/tutorial-pka/schedules");
    revalidatePath("/courses/tutorial-pka");
    revalidatePath("/courses/tutorial-pka/jadwal");
  }
  return result;
}
