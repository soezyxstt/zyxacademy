import { isSafeKey, slugifySegment } from "../../storage/keys";

// Older submissions stored JSON text. Only fields rendered in the grading UI cross the wire.
function decode(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return null; }
}

function fields(value: unknown, keys: readonly string[]) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  const record: Record<string, unknown> = {};
  for (const key of keys) {
    const item = (value as Record<string, unknown>)[key];
    if (typeof item === "string" || typeof item === "number" ||
        (Array.isArray(item) && item.every(part => typeof part === "string" || typeof part === "number"))) {
      record[key] = item;
    }
  }
  return record;
}

function tryoutAttachmentKey(answer: unknown, examId?: string) {
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) return null;
  const entry = answer as Record<string, unknown>;
  if (entry.type !== "essay" || typeof entry.fileKey !== "string" || !isSafeKey(entry.fileKey)) return null;
  if (!/^exams\/[a-z0-9-]+\/attachments\/[a-z0-9][a-z0-9._-]*$/i.test(entry.fileKey)) return null;
  if (examId && !entry.fileKey.startsWith(`exams/${slugifySegment(examId, "exam")}/attachments/`)) return null;
  return entry.fileKey;
}

export function readStoredTryoutGradeAttachment(questions: unknown, answers: unknown, questionId: string, examId: string) {
  const items = decode(questions);
  const raw = decode(answers);
  if (!Array.isArray(items) || !items.some(item => item && item.id === questionId && item.type === "essay") ||
    !raw || typeof raw !== "object" || Array.isArray(raw) || !Object.hasOwn(raw, questionId)) return null;
  return tryoutAttachmentKey((raw as Record<string, unknown>)[questionId], examId);
}

export function projectTryoutSnapshots(questions: unknown, answers: unknown, examId?: string) {
  const items = decode(questions);
  const questionsSnapshot = Array.isArray(items) ? items.map(item =>
    fields(item, ["id", "type", "prompt", "options", "correctIndex", "correctIndices", "acceptableAnswers"])) : [];
  const raw = decode(answers);
  const answersSnapshot = Object.fromEntries(questionsSnapshot.flatMap(({ id, type }) => {
    if (typeof id !== "string" || !raw || typeof raw !== "object" || Array.isArray(raw) || !Object.hasOwn(raw, id)) return [];
    const answer = (raw as Record<string, unknown>)[id];
    return [[id, { ...fields(answer, ["index", "indices", "text", "fileName", "fileSize"]),
      ...(type === "essay" && tryoutAttachmentKey(answer, examId) ? { attachmentAvailable: true } : {}) }]];
  }));
  return { questionsSnapshot, answersSnapshot };
}
