import "server-only";
import { z } from "zod";
import {
  addSessionResourceAction, collaborativeBookSlot, collaborativeCancelSlot, collaborativeMoveSlot,
  deleteSessionResourceAction, sendTicketMessage, submitRescheduleTicket, updatePreSessionContextAction,
} from "@/app/(student)/dashboard/schedule/actions";

const id = z.string().min(1).max(160);
const date = z.iso.date();
const topic = z.string().max(200);
const notes = z.string().max(5000);
const operation = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("book"), slotId: id, courseId: id, groupId: id, date, topic: topic.optional(), notes: notes.optional() }),
  z.strictObject({ action: z.literal("move"), bookingId: id, slotId: id, date }),
  z.strictObject({ action: z.literal("cancel"), bookingId: id }),
  z.strictObject({ action: z.literal("context"), bookingId: id, topic, notes: notes.optional() }),
  z.strictObject({ action: z.literal("add-resource"), bookingId: id, label: z.string().trim().min(1).max(160), url: z.url({ protocol: /^https?$/ }).max(2048) }),
  z.strictObject({ action: z.literal("delete-resource"), resourceId: id }),
  z.strictObject({ action: z.literal("message"), ticketId: id, message: z.string().trim().min(1).max(1000) }),
  z.strictObject({ action: z.literal("ticket"), bookingId: id, kind: z.enum(["reschedule", "cancellation"]),
    reason: z.string().trim().min(1).max(1000), proposedSlotId: id.optional(), proposedDate: date.optional() }),
]);

export function runNativeScheduleAction(raw: unknown) {
  const input = operation.parse(raw);
  switch (input.action) {
    case "book": return collaborativeBookSlot(input.slotId, input.courseId, input.groupId, input.date, { topic: input.topic, preSessionNotes: input.notes });
    case "move": return collaborativeMoveSlot(input.bookingId, input.slotId, input.date);
    case "cancel": return collaborativeCancelSlot(input.bookingId);
    case "context": return updatePreSessionContextAction(input.bookingId, input.topic, input.notes);
    case "add-resource": return addSessionResourceAction({ bookingId: input.bookingId, phase: "pre", kind: "link", label: input.label, url: input.url });
    case "delete-resource": return deleteSessionResourceAction(input.resourceId);
    case "message": return sendTicketMessage(input.ticketId, input.message);
    case "ticket": return submitRescheduleTicket(input.bookingId, input.kind, input.reason, input.proposedSlotId, input.proposedDate);
  }
}
