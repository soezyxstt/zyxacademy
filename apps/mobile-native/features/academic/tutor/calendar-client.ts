import { validCalendarOutcome, type CalendarAttempt, type CalendarEditor } from "../../../../../packages/academic/tutor-calendar";
import type { AcademicTransport } from "../client";

export function createCalendarEditor(transport: AcademicTransport): CalendarEditor | undefined {
  const send = transport.command?.bind(transport);
  if (!send) return undefined;
  let pending: CalendarAttempt | undefined;
  return {
    pending: () => pending,
    async save(attempt, signal) {
      if (pending && (pending.requestId !== attempt.requestId || JSON.stringify(pending.command) !== JSON.stringify(attempt.command))) return "unknown";
      pending = attempt;
      try {
        const response = await send("/api/native/academic/tutor-support/schedule/calendar",
          { method: "POST", body: attempt.command, requestId: attempt.requestId }, signal);
        if (response.ok) {
          const body: unknown = await response.json();
          if (!body || typeof body !== "object" || !("requestId" in body) || body.requestId !== attempt.requestId ||
            !("outcome" in body) || !validCalendarOutcome(body.outcome, attempt.command.action)) return "unknown";
          pending = undefined;
          return body.outcome;
        }
        if (response.status >= 500 || response.status === 429) return "unknown";
        pending = undefined;
        if (response.status === 401 || response.status === 403) return "denied";
        return response.status === 409 || response.status === 404 ? "conflict" : "invalid";
      } catch {
        return "unknown";
      }
    },
  };
}
