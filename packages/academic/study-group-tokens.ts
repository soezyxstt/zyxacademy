export type StudyGroupTokensRead = {
  groupId: string;
  tokens: Array<{ id: string; token: string; capacity: number }>;
};

export function parseStudyGroupTokens(value: unknown): StudyGroupTokensRead | null {
  if (!value || typeof value !== "object" || !("groupId" in value) ||
    typeof value.groupId !== "string" || !value.groupId || !("tokens" in value) || !Array.isArray(value.tokens)) return null;
  const tokens: StudyGroupTokensRead["tokens"] = [];
  for (const item of value.tokens) {
    if (!item || typeof item !== "object") return null;
    const { id, token, capacity } = item as Record<string, unknown>;
    if (typeof id !== "string" || !id || typeof token !== "string" || !token || typeof capacity !== "number" ||
      !Number.isInteger(capacity) || capacity < 0) return null;
    tokens.push({ id, token, capacity });
  }
  return { groupId: value.groupId, tokens };
}
