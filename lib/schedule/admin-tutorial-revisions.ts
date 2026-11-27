import { revisionOf } from "@/lib/admin-mcp/revision";

export function tutorialSlotRevision(slot: {
  id: string; tutorId: string; sessionDate: string | null; startTime: string; endTime: string; mode: string; location: string | null;
}) {
  const { id, tutorId, sessionDate, startTime, endTime, mode, location } = slot;
  return revisionOf({ id, tutorId, sessionDate, startTime, endTime, mode, location });
}

export function tutorialBookingRevision(booking: { id: string; slotId: string; status: string; lastModifiedAt: Date }) {
  const { id, slotId, status, lastModifiedAt } = booking;
  return revisionOf({ id, slotId, status, lastModifiedAt });
}

export function tutorQualificationRevision(id: string, courseIds: readonly string[]) {
  return revisionOf({ id, courseIds: [...new Set(courseIds)].sort() });
}
