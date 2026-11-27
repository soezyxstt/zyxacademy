import type { StudentRequest } from "../contracts";

export type PlaygroundDraft = { code: string; stdin: string; revision: number };
export type PlaygroundOwner = { courseId: string; userId: string; draftKey: string };
export class PlaygroundAccessError extends Error {}

function rejectDraft(response: Awaited<ReturnType<StudentRequest>>) {
  const status = response.status;
  response.dispose?.();
  if (status === 401 || status === 403) throw new PlaygroundAccessError();
  throw new Error("draft_request_failed");
}

export const emptyPlayground: PlaygroundDraft = { code: "", stdin: "", revision: 0 };

export async function loadPlaygroundDraft(request: StudentRequest, owner: PlaygroundOwner, signal: AbortSignal): Promise<PlaygroundDraft> {
  const query = new URLSearchParams({ courseId: owner.courseId, draftKey: owner.draftKey });
  const response = await request(`/api/coding/drafts?${query}`, { headers: { "x-student-id": owner.userId }, signal });
  if (!response.ok) rejectDraft(response);
  const payload = await response.json();
  if (!payload || typeof payload !== "object" || !("draft" in payload)) throw new Error("invalid_draft");
  if (payload.draft === null) return emptyPlayground;
  const row = payload.draft;
  if (!row || typeof row !== "object" || !("code" in row) || typeof row.code !== "string" || row.code.length > 64000 ||
    !("stdin" in row) || typeof row.stdin !== "string" || row.stdin.length > 8000 ||
    !("revision" in row) || typeof row.revision !== "number" || !Number.isSafeInteger(row.revision) || row.revision < 1) throw new Error("invalid_draft");
  return { code: row.code, stdin: row.stdin, revision: row.revision };
}

export async function savePlaygroundDraft(request: StudentRequest, owner: PlaygroundOwner, draft: PlaygroundDraft, signal: AbortSignal) {
  const response = await request("/api/coding/drafts", { method: "PUT", signal,
    headers: { "Content-Type": "application/json", "x-student-id": owner.userId },
    body: JSON.stringify({ ...draft, draftKey: owner.draftKey, courseId: owner.courseId }) });
  if (response.status === 409) { response.dispose?.(); return { conflict: true } as const; }
  if (!response.ok) rejectDraft(response);
  const result = await response.json();
  if (!result || typeof result !== "object" || !("revision" in result) || result.revision !== draft.revision + 1) throw new Error("invalid_receipt");
  return { conflict: false, revision: result.revision } as const;
}

export function restoreLocalPlayground(raw: string | null): PlaygroundDraft | null {
  if (!raw || raw.length > 460_000) return null;
  try {
    const row = JSON.parse(raw);
    if (typeof row?.code !== "string" || row.code.length > 64000 || typeof row.stdin !== "string" ||
      row.stdin.length > 8000 || !Number.isSafeInteger(row.revision) || row.revision < 0) return null;
    return { code: row.code, stdin: row.stdin, revision: row.revision };
  } catch { return null; }
}

export function playgroundStorageKey(courseId: string, draftKey: string) {
  return "coding:playground:" + JSON.stringify([courseId, draftKey]);
}
