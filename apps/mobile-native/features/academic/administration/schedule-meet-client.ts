import type { AcademicTransport } from "../client";
import { validTutorialTargetId } from "../../../../../packages/academic/admin-tutorial-operations";

const path = "/api/native/academic-administration/schedule-meet";
export type MeetProgress = { ready: number; changed: number; rejected: number; uncertain: number };

export async function provisionScheduledMeets(transport: AcademicTransport, signal: AbortSignal, newId: () => string, progress: (value: MeetProgress) => void) {
  if (!transport.command) throw new Error("FORBIDDEN");
  const counts = { ready: 0, changed: 0, rejected: 0, uncertain: 0 };
  let after: string | undefined;
  do {
    if (signal.aborted) throw new Error("ABORTED");
    const response = await transport.get(path + (after ? "?after=" + encodeURIComponent(after) : ""), signal);
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "FORBIDDEN" : "READ_FAILED");
    const page = await response.json() as { ids?: string[]; next?: string };
    if (!Array.isArray(page?.ids) || page.ids.length > 25 || !page.ids.every(validTutorialTargetId) ||
        (page.next !== undefined && (!validTutorialTargetId(page.next) || page.next !== page.ids.at(-1) || after === page.next))) throw new Error("READ_FAILED");
    for (const bookingId of page.ids) {
      if (signal.aborted) throw new Error("ABORTED");
      const requestId = newId();
      const reply = await transport.command(path, { method: "POST", body: { bookingId }, requestId }, signal);
      if (reply.status === 401 || reply.status === 403) throw new Error("FORBIDDEN");
      const value = await reply.json() as { status?: string; id?: string; requestId?: string; error?: string } | null;
      if (reply.ok && value?.status === "saved" && value.id === bookingId && value.requestId === requestId) counts.ready++;
      else if (value?.error === "BOOKING_CHANGED") counts.changed++;
      else if (value?.error === "MEET_REJECTED") counts.rejected++;
      else counts.uncertain++;
      if (!signal.aborted) progress({ ...counts });
    }
    after = page.next;
  } while (after);
  return counts;
}
