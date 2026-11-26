import {
  isPkaAnnouncementRevision, type PkaAnnouncementConflict, type PkaAnnouncementEdit, type PkaAnnouncementSaved,
} from "../../../../../packages/academic/pka-announcement-edit";
import { ADMINISTRATION_API_PREFIX } from "../../../../../packages/native-parity/academic/administration/live";
import type { AcademicTransport } from "../client";

export type PkaAnnouncementEditOutcome = PkaAnnouncementSaved | PkaAnnouncementConflict | {
  status: "denied" | "missing" | "invalid" | "uncertain" | "request_conflict";
};

export async function savePkaAnnouncement(transport: AcademicTransport, id: string, draft: PkaAnnouncementEdit,
  requestId: string, signal: AbortSignal): Promise<PkaAnnouncementEditOutcome> {
  if (!transport.command) return { status: "denied" };
  const response = await transport.command(`${ADMINISTRATION_API_PREFIX}announcements/${encodeURIComponent(id)}`,
    { method: "PATCH", body: draft, requestId }, signal);
  if (response.status === 401 || response.status === 403) return { status: "denied" };
  if (response.status === 404) return { status: "missing" };
  if (response.status === 400 || response.status === 415 || response.status === 422) return { status: "invalid" };
  const value: unknown = await response.json().catch(() => null);
  if (value && typeof value === "object" && "status" in value && "announcement" in value && isPkaAnnouncementRevision(value.announcement)) {
    if (response.ok && value.status === "saved" && "requestId" in value && value.requestId === requestId) return {
      status: "saved", announcement: value.announcement, requestId,
    };
    if (response.status === 409 && value.status === "conflict") return { status: "conflict", announcement: value.announcement };
  }
  if (response.status === 409) return { status: "request_conflict" };
  return { status: "uncertain" };
}
