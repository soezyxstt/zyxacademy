import { isStudyGroupMembersRead, type StudyGroupMemberEdit, type StudyGroupMemberRecovery } from "../../../../../packages/academic/study-group-members";
import { ADMINISTRATION_API_PREFIX } from "../../../../../packages/native-parity/academic/administration/live";
import type { AcademicTransport } from "../client";

const path = (id: string) => `${ADMINISTRATION_API_PREFIX}groups/${encodeURIComponent(id)}/members`;

export async function readStudyGroupMembers(transport: AcademicTransport, id: string, page: number, search: string, signal: AbortSignal,
  recovery?: StudyGroupMemberRecovery) {
  const query = new URLSearchParams({ page: String(page), search });
  if (recovery) {
    query.set("retryUserId", recovery.userId);
    query.set("retryAction", recovery.action);
    query.set("retryRevision", recovery.expectedRevision);
    query.set("retryRequestId", recovery.requestId);
  }
  const response = await transport.get(`${path(id)}?${query}`, signal);
  if (response.status === 401 || response.status === 403) return { status: "denied" as const };
  if (response.status === 404) return { status: "missing" as const };
  const data: unknown = await response.json().catch(() => null);
  if (response.ok && isStudyGroupMembersRead(data) && data.id === id
    && (!data.recoveryTarget || data.recoveryTarget.id === recovery?.userId)) return { status: "ready" as const, data };
  return { status: "error" as const };
}

export async function writeStudyGroupMember(transport: AcademicTransport, id: string, draft: StudyGroupMemberEdit, requestId: string, signal: AbortSignal) {
  if (!transport.command || draft.accountId !== transport.accountId) return "denied";
  const response = await transport.command(path(id), { method: "PATCH", body: draft, requestId }, signal);
  if (response.status === 401 || response.status === 403) return "denied";
  if (response.status === 400 || response.status === 415 || response.status === 422) return "invalid";
  if (response.status === 404 || response.status === 409) return "stale";
  const result: unknown = await response.json().catch(() => null);
  if (response.ok && result && typeof result === "object" && "status" in result && result.status === "saved"
    && "id" in result && result.id === id && "requestId" in result && result.requestId === requestId
    && "userId" in result && result.userId === draft.userId && "action" in result && result.action === draft.action) return "saved";
  return "uncertain";
}
