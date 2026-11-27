import "server-only";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { copyTutorAvailabilityFromPreviousWeek, executeDeleteTutorSlot, executeMoveTutorSession } from "@/app/(tutor)/tutor/schedule/actions";
import { db } from "@/db";
import { auditMutasi, bookings, session, tutorSlots } from "@/db/schema";
import { buildTutorMutationAuditRow, recordTutorMutationAudit } from "@/lib/audit/mutasi";
import { assertAuthoringActor } from "@/lib/auth/authoring-actor";
import { triggerGoogleCalendarSyncForBookingId } from "@/lib/google-calendar/trigger";
import { lockScheduleEntity } from "@/lib/schedule/transaction-lock";
import { notifyTutorSessionMove } from "@/lib/schedule/tutor-ticket-notifications";
import { stableStringify } from "@/lib/staging/migration-ledger";
import { validCalendarOutcome, type CalendarCommand, type CalendarOutcome } from "@/packages/academic/tutor-calendar";
import { tutorSlotDetails } from "./tutor-slot-service";
import type { TicketActor } from "./tutor-ticket-service";

export async function writeTutorCalendar(actor: TicketActor, command: CalendarCommand) {
  const { id, sessionId, requestId } = actor;
  const digest = (value: unknown) => createHash("sha256").update(stableStringify(value)).digest("hex");
  const fingerprint = digest([sessionId, command]);
  const receipt = { actorId: id, actorRoles: ["tutor"], courseId: "global", entityType: "native_command",
    entityId: "tutor-calendar", entityVersion: 1, action: "native.tutor.calendar", outcome: "success",
    reason: "Tutor calendar command receipt", requestId: "native-calendar-" + digest([id, requestId]) } as const;
  const result = await db.transaction(async tx => {
    await lockScheduleEntity(tx, "tutor", id);
    await assertAuthoringActor(tx, id, { roles: ["tutor"], error: "FORBIDDEN", lock: true });
    const [active] = await tx.select({ expiresAt: session.expiresAt }).from(session)
      .where(and(eq(session.id, sessionId), eq(session.userId, id))).for("share");
    if (!active || active.expiresAt.getTime() <= Date.now()) throw new Error("UNAUTHENTICATED");
    const [entry] = await tx.select({ after: auditMutasi.afterSnapshot }).from(auditMutasi)
      .where(eq(auditMutasi.id, buildTutorMutationAuditRow(receipt).id)).limit(1);
    if (entry) {
      const saved = entry.after?.snapshot as { fingerprint?: string; outcome?: unknown } | undefined;
      if (saved?.fingerprint !== fingerprint || !validCalendarOutcome(saved.outcome, command.action)) throw new Error("CONFLICT");
      return { outcome: saved.outcome, replay: true };
    }
    const options = { actorId: id, executor: tx };
    let outcome: CalendarOutcome;
    let notify: (() => Promise<void>) | undefined;
    if (command.action === "copy") {
      const res = await copyTutorAvailabilityFromPreviousWeek(command.week, options);
      if (!res.success) return { failure: res.reason === "DATABASE_ERROR" ? "SAVE_FAILED" : "CONFLICT" } as const;
      outcome = { action: "copy", created: res.createdCount, skipped: res.skippedCount };
    } else if (command.action === "delete") {
      const [slot] = await tx.select({ id: tutorSlots.id }).from(tutorSlots)
        .where(and(eq(tutorSlots.id, command.slotId), eq(tutorSlots.tutorId, id))).for("update");
      if (!slot) throw new Error("NOT_FOUND");
      const [current] = await tutorSlotDetails(id, [slot.id], tx);
      if (!current || current.booked || current.revision !== command.expectedRevision) throw new Error("CONFLICT");
      const res = await executeDeleteTutorSlot({ slotId: slot.id }, options);
      if (!res.success) return { failure: res.reason === "DATABASE_ERROR" ? "SAVE_FAILED" : "CONFLICT" } as const;
      outcome = { action: "delete" };
    } else {
      const [booking] = await tx.select({ slotId: bookings.slotId, courseId: bookings.courseId, groupId: bookings.groupId }).from(bookings)
        .innerJoin(tutorSlots, eq(bookings.slotId, tutorSlots.id)).where(and(eq(bookings.id, command.bookingId), eq(tutorSlots.tutorId, id))).for("no key update");
      if (!booking) throw new Error("NOT_FOUND");
      if (booking.slotId !== command.expectedSlotId) throw new Error("CONFLICT");
      const [slot] = await tx.select({ dayOfWeek: tutorSlots.dayOfWeek, startTime: tutorSlots.startTime, endTime: tutorSlots.endTime,
        date: tutorSlots.sessionDate }).from(tutorSlots).where(and(eq(tutorSlots.id, command.targetSlotId), eq(tutorSlots.tutorId, id))).for("no key update");
      if (!slot) throw new Error("NOT_FOUND");
      if (slot.date !== command.date || booking.slotId === command.targetSlotId) throw new Error("CONFLICT");
      const res = await executeMoveTutorSession({ bookingId: command.bookingId, targetSlotId: command.targetSlotId,
        targetSessionDate: command.date, reason: command.reason }, { ...options, skipNotifications: true });
      if (!res.success) return { failure: res.reason === "DATABASE_ERROR" ? "SAVE_FAILED" : "CONFLICT" } as const;
      outcome = { action: "move", moved: res.movedDirectly === true };
      if (outcome.moved) notify = () => notifyTutorSessionMove(booking, slot, command.date);
    }
    await recordTutorMutationAudit({ ...receipt, after: { fingerprint, outcome } }, tx);
    return { outcome, replay: false, notify };
  });
  if (result.failure) throw new Error(result.failure);
  if (!result.replay && command.action === "move") {
    await result.notify?.();
    await triggerGoogleCalendarSyncForBookingId(command.bookingId);
  }
  return { requestId, outcome: result.outcome };
}
