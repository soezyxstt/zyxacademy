import { isAdminUserStatusRevision, type AdminUserStatusEdit } from "../../../../../packages/academic/admin-user-status";
import { ADMINISTRATION_API_PREFIX } from "../../../../../packages/native-parity/academic/administration/live";
import type { AcademicTransport } from "../client";

export async function saveUserStatus(transport: AcademicTransport, id: string, draft: AdminUserStatusEdit, requestId: string, signal: AbortSignal) {
  if (!transport.command || draft.accountId !== transport.accountId) return "denied";
  const response = await transport.command(`${ADMINISTRATION_API_PREFIX}users/${encodeURIComponent(id)}/status`, {
    method: "PATCH", body: draft, requestId,
  }, signal);
  if (response.status === 401 || response.status === 403) return "denied";
  if (response.status === 404) return "missing";
  if (response.status === 400 || response.status === 415 || response.status === 422) return "invalid";
  const value: unknown = await response.json().catch(() => null);
  if (value && typeof value === "object" && "status" in value && "userStatus" in value
    && "id" in value && value.id === id && "requestId" in value && value.requestId === requestId
    && isAdminUserStatusRevision(value.userStatus)) {
    if (response.ok && value.status === "saved" && value.userStatus.status === draft.status) return "saved";
    if (response.status === 409 && value.status === "conflict") return "stale";
  }
  if (response.status === 409 && value && typeof value === "object" && "error" in value && value.error === "REQUEST_CONFLICT") return "stale";
  return "uncertain";
}
