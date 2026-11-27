import "server-only";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { executeDecideTutorRescheduleTicket, executeReplyTutorTicketMessage } from "@/app/(tutor)/tutor/schedule/actions";
import { db } from "@/db";
import { auditMutasi, bookingRescheduleTickets, bookings, session, tutorSlots, user } from "@/db/schema";
import { buildTutorMutationAuditRow, recordTutorMutationAudit } from "@/lib/audit/mutasi";
import { assertAuthoringActor } from "@/lib/auth/authoring-actor";
import { triggerGoogleCalendarSyncForRescheduleTicketId } from "@/lib/google-calendar/trigger";
import { lockScheduleEntity } from "@/lib/schedule/transaction-lock";
import { notifyTutorTicketDecision, notifyTutorTicketReply } from "@/lib/schedule/tutor-ticket-notifications";
import { stableStringify } from "@/lib/staging/migration-ledger";
import type { TutorTicketCommand } from "@/packages/academic/tutor-ticket";

const digest = (value: unknown) => createHash("sha256").update(stableStringify(value)).digest("hex");
export type TicketActor = { id: string; sessionId: string; requestId: string };

export async function writeTutorTicket(actor: TicketActor, ticketId: string, command: TutorTicketCommand) {
  const result = await db.transaction(async tx => {
    await lockScheduleEntity(tx, "ticket", ticketId);
    await assertAuthoringActor(tx, actor.id, { roles: ["tutor"], error: "FORBIDDEN", lock: true });
    const [account] = await tx.select({ expiresAt: session.expiresAt, name: user.name }).from(session)
      .innerJoin(user, eq(user.id, session.userId)).where(and(eq(session.id, actor.sessionId), eq(user.id, actor.id))).limit(1).for("share");
    if (!account || account.expiresAt.getTime() <= Date.now()) throw new Error("UNAUTHENTICATED");
    const [ticket] = await tx.select({ type: bookingRescheduleTickets.type, groupId: bookings.groupId,
      courseId: bookings.courseId, proposedSlotId: bookingRescheduleTickets.proposedSlotId }).from(bookingRescheduleTickets)
      .innerJoin(bookings, and(eq(bookings.id, bookingRescheduleTickets.bookingId), eq(bookings.groupId, bookingRescheduleTickets.groupId)))
      .innerJoin(tutorSlots, and(eq(tutorSlots.id, bookings.slotId), eq(tutorSlots.tutorId, actor.id)))
      .where(eq(bookingRescheduleTickets.id, ticketId)).limit(1).for("no key update");
    if (!ticket) throw new Error("NOT_FOUND");
    const receipt = { actorId: actor.id, actorRoles: ["tutor"], courseId: ticket.courseId, entityType: "reschedule_ticket",
      entityId: ticketId, entityVersion: 1, action: "native.tutor.ticket", outcome: "success", reason: "Tutor schedule ticket receipt",
      requestId: "native-ticket-" + digest([actor.id, actor.requestId]) } as const;
    const fingerprint = digest([actor.sessionId, ticketId, command]);
    const [saved] = await tx.select({ after: auditMutasi.afterSnapshot }).from(auditMutasi)
      .where(eq(auditMutasi.id, buildTutorMutationAuditRow(receipt).id)).limit(1);
    if (saved) {
      const snapshot = saved.after?.snapshot as { fingerprint?: string } | null | undefined;
      if (snapshot?.fingerprint !== fingerprint) throw new Error("CONFLICT");
      return { replay: true, ticket, name: account.name };
    }
    if (command.action === "decide" && command.decision === "approved" && ticket.type === "reschedule" && ticket.proposedSlotId) {
      const [target] = await tx.select({ id: tutorSlots.id }).from(tutorSlots)
        .where(and(eq(tutorSlots.id, ticket.proposedSlotId), eq(tutorSlots.tutorId, actor.id))).limit(1).for("no key update");
      if (!target) throw new Error("FORBIDDEN");
    }
    const options = { actorId: actor.id, executor: tx, skipNotifications: true };
    const outcome = command.action === "reply" ? await executeReplyTutorTicketMessage({ ticketId, message: command.message }, options)
      : await executeDecideTutorRescheduleTicket({ ticketId, decision: command.decision, decisionNotes: command.notes }, options);
    if (!outcome.success) return { failure: outcome.reason || "DATABASE_ERROR" };
    await recordTutorMutationAudit({ ...receipt, after: { fingerprint } }, tx);
    return { replay: false, ticket, name: account.name };
  });
  if ("failure" in result) {
    if (result.failure === "DATABASE_ERROR") throw new Error("SAVE_FAILED");
    if (result.failure === "AUTH_FAILED" || result.failure === "NOT_ASSIGNED_TUTOR") throw new Error("FORBIDDEN");
    throw new Error("CONFLICT");
  }
  if (!result.replay) {
    if (command.action === "reply") await notifyTutorTicketReply(result.ticket, command.message, result.name);
    else {
      await notifyTutorTicketDecision(result.ticket, command.decision, command.notes || null);
      if (command.decision === "approved") await triggerGoogleCalendarSyncForRescheduleTicketId(ticketId);
    }
    revalidatePath("/tutor/schedule");
    revalidatePath("/dashboard/schedule");
  }
  return { requestId: actor.requestId, ticketId };
}
