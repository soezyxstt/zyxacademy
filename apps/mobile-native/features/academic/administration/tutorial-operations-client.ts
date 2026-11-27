import type { AdminTutorialCommand } from "../../../../../packages/academic/admin-tutorial-operations";
import { validTutorialTargetId } from "../../../../../packages/academic/admin-tutorial-operations";
import { ADMINISTRATION_API_PREFIX } from "../../../../../packages/native-parity/academic/administration/live";
import type { AcademicTransport } from "../client";

export type TutorialAttempt = { command: AdminTutorialCommand; requestId: string };
export type TutorialResult = { status: "saved"; id: string } | { status: "uncertain" } |
  { status: "denied" | "invalid" | "missing" | "conflict"; code: string };

const pending = new WeakMap<AcademicTransport, { attempt: TutorialAttempt; sending?: Promise<TutorialResult> }>();

export function pendingTutorialOperation(transport: AcademicTransport) { return pending.get(transport)?.attempt; }

export async function submitTutorialOperation(transport: AcademicTransport, attempt: TutorialAttempt, signal: AbortSignal): Promise<TutorialResult> {
  const previous = pending.get(transport);
  if (previous && (previous.attempt.requestId !== attempt.requestId || JSON.stringify(previous.attempt.command) !== JSON.stringify(attempt.command))) {
    return { status: "uncertain" };
  }
  if (previous?.sending) return previous.sending;
  if (!transport.command) return { status: "denied", code: "FORBIDDEN" };
  const entry = previous ?? { attempt: JSON.parse(JSON.stringify(attempt)) as TutorialAttempt };
  pending.set(transport, entry);

  entry.sending = (async () => {
    try {
      const response = await transport.command!(ADMINISTRATION_API_PREFIX + "tutorial-operations",
        { method: "POST", requestId: entry.attempt.requestId, body: entry.attempt.command }, signal);
      const value: unknown = await response.json().catch(() => null);
      const body = value && typeof value === "object" ? value as Record<string, unknown> : {};
      let result: TutorialResult;
      const { command } = entry.attempt;
      const idMatches = validTutorialTargetId(body.id) && (!("id" in command) || command.action === "assign" || command.id === body.id);
      if (response.ok && body.status === "saved" && body.requestId === entry.attempt.requestId && idMatches && typeof body.id === "string") {
        result = { status: "saved", id: body.id };
      } else {
        const code = typeof body.error === "string" ? body.error : "";
        if (response.status === 401 || response.status === 403) result = { status: "denied", code };
        else if (response.status === 404) result = { status: "missing", code };
        else if (response.status === 409) result = { status: "conflict", code };
        else if ([400, 415, 422].includes(response.status)) result = { status: "invalid", code };
        else result = { status: "uncertain" };
      }
      if (result.status !== "uncertain" && !signal.aborted && pending.get(transport) === entry) pending.delete(transport);
      return result;
    } catch {
      return { status: "uncertain" };
    }
  })();
  try { return await entry.sending; }
  finally { entry.sending = undefined; }
}
