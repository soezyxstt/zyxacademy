import { isPkaScheduleRevision, type PkaScheduleEdit } from "../../../../../packages/academic/pka-schedule-edit";
import { ADMINISTRATION_API_PREFIX } from "../../../../../packages/native-parity/academic/administration/live";
import type { AcademicTransport } from "../client";

export async function savePkaSchedule(transport: AcademicTransport, id: string, draft: PkaScheduleEdit,
  requestId: string, signal: AbortSignal) {
  if (!transport.command) return { status: "denied" } as const;
  const response = await transport.command(`${ADMINISTRATION_API_PREFIX}sessions/${encodeURIComponent(id)}`,
    { method: "PATCH", body: draft, requestId }, signal);
  if (response.status === 401 || response.status === 403) return { status: "denied" } as const;
  if (response.status === 404) return { status: "missing" } as const;
  const value: unknown = await response.json().catch(() => null);
  if (value && typeof value === "object" && "status" in value && "id" in value && value.id === id
    && "requestId" in value && value.requestId === requestId && "schedule" in value && isPkaScheduleRevision(value.schedule)) {
    if (response.ok && value.status === "saved") return { status: "saved", schedule: value.schedule } as const;
    if (response.status === 409 && value.status === "conflict") return { status: "conflict", schedule: value.schedule } as const;
  }
  const error = value && typeof value === "object" && "error" in value ? value.error : undefined;
  if (response.status === 409 && error === "REQUEST_CONFLICT") return { status: "request_conflict" } as const;
  if (response.status === 422 && error === "WEB_DELIVERY_REQUIRED") return { status: "web_delivery" } as const;
  if (response.status === 400 || response.status === 415 || response.status === 422) return { status: "invalid" } as const;
  return { status: "uncertain" } as const;
}
