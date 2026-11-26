import { studyGroupTokensRead } from "../../../../../packages/academic/study-group-tokens";
import { ADMINISTRATION_API_PREFIX } from "../../../../../packages/native-parity/academic/administration/live";
import type { AcademicTransport } from "../client";

export async function readStudyGroupTokens(transport: AcademicTransport, id: string, signal: AbortSignal) {
  const response = await transport.get(`${ADMINISTRATION_API_PREFIX}groups/${encodeURIComponent(id)}/tokens`, signal);
  if (response.status === 401 || response.status === 403) return { status: "denied" as const };
  if (response.status === 404) return { status: "missing" as const };
  if (response.ok) {
    const parsed = studyGroupTokensRead.safeParse(await response.json().catch(() => null));
    if (parsed.success && parsed.data.groupId === id) return { status: "ready" as const, tokens: parsed.data.tokens };
  }
  return { status: "error" as const };
}
