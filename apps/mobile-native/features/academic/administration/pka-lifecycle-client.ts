import type { PkaLifecycleCommand } from "../../../../../packages/academic/pka-lifecycle";
import { ADMINISTRATION_API_PREFIX } from "../../../../../packages/native-parity/academic/administration/live";
import type { AcademicTransport } from "../client";

export type PkaLifecycleAttempt = { command: PkaLifecycleCommand; requestId: string };

export async function submitPkaLifecycle(transport: AcademicTransport, attempt: PkaLifecycleAttempt, signal: AbortSignal) {
  if (!transport.command) return { status: "denied" } as const;
  const response = await transport.command(ADMINISTRATION_API_PREFIX + "pka-lifecycle",
    { method: "POST", requestId: attempt.requestId, body: attempt.command }, signal);
  if (response.status === 401 || response.status === 403) return { status: "denied" } as const;
  if (response.status === 404) return { status: "missing" } as const;
  const value: unknown = await response.json().catch(() => null);
  const body = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const idMatches = typeof body.id === "string" && Boolean(body.id) && (!("id" in attempt.command) || attempt.command.id === body.id);
  if (idMatches && body.requestId === attempt.requestId) {
    if (response.ok && body.status === "saved") return { status: "saved",
      ...(body.delivery === "queued" ? { delivery: "queued" as const } : {}) } as const;
    if (response.status === 409 && body.status === "conflict") return { status: "conflict" } as const;
  }
  if (response.status === 409 && body.error === "REQUEST_CONFLICT") return { status: "conflict" } as const;
  if ([400, 415, 422].includes(response.status)) return { status: "invalid" } as const;
  return { status: "uncertain" } as const;
}
