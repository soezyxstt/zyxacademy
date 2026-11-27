import type { TutorTicketAttempt, TutorTicketEditor } from "../../../../../packages/academic/tutor-ticket";
import type { AcademicTransport } from "../client";

export function createTutorTicketEditor(transport: AcademicTransport): TutorTicketEditor | undefined {
  const send = transport.command?.bind(transport);
  if (!send) return undefined;
  const attempts = new Map<string, TutorTicketAttempt>();
  return {
    pending: id => attempts.get(id),
    async submit(id, draft, signal) {
      const prior = attempts.get(id);
      if (prior && (prior.requestId !== draft.requestId || JSON.stringify(prior.command) !== JSON.stringify(draft.command))) return "unknown";
      const attempt = prior ?? draft;
      attempts.set(id, attempt);
      try {
        const response = await send("/api/native/academic/tutor-support/schedule/tickets/" + encodeURIComponent(id),
          { method: "POST", body: attempt.command, requestId: attempt.requestId }, signal);
        if (response.ok) {
          const body: unknown = await response.json();
          if (!body || typeof body !== "object" || !("ticketId" in body) || body.ticketId !== id ||
            !("requestId" in body) || body.requestId !== attempt.requestId) return "unknown";
          attempts.delete(id);
          return "saved";
        }
        if (response.status >= 500 || response.status === 429) return "unknown";
        attempts.delete(id);
        if (response.status === 401 || response.status === 403) return "denied";
        if (response.status === 404) return "missing";
        return response.status === 409 ? "conflict" : "invalid";
      } catch {
        return "unknown";
      }
    },
  };
}
