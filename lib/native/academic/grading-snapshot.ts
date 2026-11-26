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

export function projectTryoutSnapshots(questions: unknown, answers: unknown) {
  const items = decode(questions);
  const questionsSnapshot = Array.isArray(items) ? items.map(item =>
    fields(item, ["id", "type", "prompt", "options", "correctIndex", "correctIndices", "acceptableAnswers"])) : [];
  const raw = decode(answers);
  const answersSnapshot = Object.fromEntries(questionsSnapshot.flatMap(({ id }) =>
    typeof id === "string" && raw && typeof raw === "object" && Object.hasOwn(raw, id)
      ? [[id, fields((raw as Record<string, unknown>)[id], ["index", "indices", "text", "fileName"])]] : []));
  return { questionsSnapshot, answersSnapshot };
}
