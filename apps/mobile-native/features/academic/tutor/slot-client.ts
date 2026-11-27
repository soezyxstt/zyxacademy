import { addCalendarDays, isCalendarDate } from "../../../../../lib/date-utils";
import type { TutorSlotEditor, TutorSlotPending, TutorSlotResult } from "../../../../../packages/academic/tutor-slot";
import { NativeRequestNotDispatched } from "../../../network/transport";
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
        prior.fields.location !== fields.location || prior.fields.notes !== fields.notes || prior.fields.weeks !== fields.weeks ||
        JSON.stringify(prior.fields.courseIds) !== JSON.stringify(fields.courseIds))) return { status: "unknown" };
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
            if (response.status === 401 || response.status === 403) return { status: "denied" };
            return { status: response.status === 404 ? "missing" : "invalid" };
          }
          const data = await response.json();
          const weeks = fields.weeks ?? 1;
          const allowedDates = isCalendarDate(fields.date) ? Array.from({ length: weeks }, (_, index) => addCalendarDays(fields.date, index * 7)) : [];
          if (!data || typeof data !== "object" || !("requestId" in data) || data.requestId !== attempt.requestId ||
            !("slotId" in data) || typeof data.slotId !== "string" || !data.slotId ||
            (target && data.slotId !== target.slotId) || !("date" in data) || typeof data.date !== "string" || !allowedDates.includes(data.date)) {
            return { status: "unknown" };
          }
          let counts: { created: number; skipped: number } | undefined;
          if (weeks > 1) {
            if (!("created" in data) || typeof data.created !== "number" || !Number.isInteger(data.created) || data.created < 1 ||
              !("skipped" in data) || typeof data.skipped !== "number" || !Number.isInteger(data.skipped) || data.skipped < 0 ||
              data.created + data.skipped !== weeks) return { status: "unknown" };
            counts = { created: data.created, skipped: data.skipped };
          }
          pending.delete(key);
          return { status: "saved", receipt: { requestId: attempt.requestId, slotId: data.slotId, date: data.date, ...counts } };
        } catch (error) {
          if (error instanceof NativeRequestNotDispatched && !prior) {
            pending.delete(key);
            throw error;
          }
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
