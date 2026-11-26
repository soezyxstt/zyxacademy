import type { TutorSlotEditor, TutorSlotPending, TutorSlotResult } from "../../../../../packages/academic/tutor-slot";
import type { AcademicTransport } from "../client";

type Attempt = TutorSlotPending & { requestId: string; operation?: Promise<TutorSlotResult> };

export function createTutorSlotEditor(transport: AcademicTransport): TutorSlotEditor | undefined {
  const send = transport.command?.bind(transport);
  if (!send) return undefined;
  const pending = new Map<string | undefined, Attempt>();
  return {
    pending: () => [...pending.values()],
    async save(target, fields, requestId, signal) {
      const key = target?.slotId;
      const prior = pending.get(key);
      if (prior && (prior.target?.expectedRevision !== target?.expectedRevision ||
        prior.fields.date !== fields.date || prior.fields.start !== fields.start || prior.fields.mode !== fields.mode ||
        prior.fields.location !== fields.location || prior.fields.notes !== fields.notes)) return { status: "unknown" };
      if (prior?.operation) return prior.operation;
      const attempt = prior ?? { target, fields, requestId };
      pending.set(key, attempt);

      const execute = async (): Promise<TutorSlotResult> => {
        try {
          const path = "/api/native/academic/tutor-support/schedule/slots" + (target ? "/" + encodeURIComponent(target.slotId) : "");
          const response = await send(path, {
            method: target ? "PATCH" : "POST", requestId: attempt.requestId,
            body: target ? { ...attempt.fields, expectedRevision: target.expectedRevision } : attempt.fields,
          }, signal);
          if (!response.ok) {
            if (response.status >= 500 || response.status === 429) return { status: "unknown" };
            pending.delete(key);
            if (response.status === 409) {
              const failure = await response.json().catch(() => null);
              const code = failure && typeof failure === "object" && "error" in failure ? failure.error : null;
              if (code === "CANNOT_EDIT_BOOKED_SLOT") return { status: "booked" };
              if (code === "DUPLICATE_TUTOR_SLOT" || code === "TUTOR_SLOT_OVERLAP") return { status: "overlap" };
              return { status: "conflict" };
            }
            return { status: [401, 403, 404].includes(response.status) ? "denied" : "invalid" };
          }
          const data = await response.json();
          if (!data || typeof data !== "object" || !("requestId" in data) || data.requestId !== attempt.requestId ||
            !("slotId" in data) || typeof data.slotId !== "string" || !data.slotId ||
            (target && data.slotId !== target.slotId) || !("date" in data) || data.date !== fields.date) {
            return { status: "unknown" };
          }
          pending.delete(key);
          return { status: "saved", receipt: { requestId: attempt.requestId, slotId: data.slotId, date: fields.date } };
        } catch {
          return { status: "unknown" };
        }
      };
      attempt.operation = execute();
      try {
        return await attempt.operation;
      } finally {
        attempt.operation = undefined;
      }
    },
  };
}
