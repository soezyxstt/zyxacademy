import { tryoutGradeRevisionPattern, type TryoutGradeCommand, type TryoutGradeDraft, type TryoutGradeEditor, type TryoutGradeResult } from "../../../../../packages/academic/tryout-grade";
import type { AcademicTransport } from "../client";

type Pending = { data: TryoutGradeCommand; requestId: string; operation?: Promise<TryoutGradeResult> };

export function createTryoutGradeEditor(transport: AcademicTransport): TryoutGradeEditor | undefined {
  const command = transport.command?.bind(transport);
  if (!command) return undefined;

  const drafts = new Map<string, TryoutGradeDraft>();
  const pending = new Map<string, Pending>();
  const keyFor = (course: string, submission: string) => JSON.stringify([course, submission]);

  return {
    draft: (course, submission) => drafts.get(keyFor(course, submission)),
    changeDraft(course, submission, value) {
      const key = keyFor(course, submission);
      if (value) drafts.set(key, value);
      else drafts.delete(key);
    },
    pending: (course, submission) => pending.get(keyFor(course, submission))?.data,
    async publish(course, submission, value, requestId, signal) {
      const key = keyFor(course, submission);
      const existing = pending.get(key);
      if (existing && (existing.data.score !== value.score || existing.data.notes !== value.notes ||
          existing.data.expectedRevision !== value.expectedRevision)) {
        return { status: "unknown" };
      }
      if (existing?.operation) return existing.operation;
      const entry = existing ?? { data: value, requestId };
      pending.set(key, entry);
      const execute = async (): Promise<TryoutGradeResult> => {
        try {
          const path = `/api/native/academic/tutor-support/courses/${encodeURIComponent(course)}/grading/${encodeURIComponent(submission)}`;
          const response = await command(path, { method: "POST", body: entry.data, requestId: entry.requestId }, signal);
          if (!response.ok) {
            if ([400, 413, 415, 422].includes(response.status)) {
              pending.delete(key);
              return { status: "invalid" };
            }
            if ([401, 403, 404, 409].includes(response.status)) {
              pending.delete(key);
              drafts.delete(key);
              return { status: response.status === 409 ? "conflict" : "denied" };
            }
            return { status: "unknown" };
          }
          const payload = await response.json();
          if (!payload || typeof payload !== "object" || !("requestId" in payload) ||
            !("submissionId" in payload) || !("reviewRevision" in payload) ||
            payload.requestId !== entry.requestId || payload.submissionId !== submission ||
            typeof payload.reviewRevision !== "string" || !tryoutGradeRevisionPattern.test(payload.reviewRevision)) {
            return { status: "unknown" };
          }
          pending.delete(key);
          drafts.delete(key);
          return { status: "saved", receipt: { requestId: entry.requestId, submissionId: submission, reviewRevision: payload.reviewRevision } };
        } catch {
          return { status: "unknown" };
        }
      };
      entry.operation = execute();
      try {
        return await entry.operation;
      } finally {
        entry.operation = undefined;
      }
    },
  };
}
