import en from "../../../../../messages/en/discussions.json";
import id from "../../../../../messages/id/discussions.json";

type AiStatus = { status: string; reason: string | null };
export function threadRefreshDelay(thread: { aiStatuses: AiStatus[] }) {
  return thread.aiStatuses.some(row => row.status === "pending" || row.status === "processing") ? 4_000 : 60_000;
}
export const listRefreshDelay = () => 120_000;

export function discussionAiMessage(row: AiStatus, locale: string) {
  const messages = locale === "en" ? en : id;
  const key = row.status === "failed" || row.status === "uncertain" ? row.reason || `ai_${row.status}` : `ai_${row.status}`;
  if (key === "ai_request" || !key.startsWith("ai_") || !Object.hasOwn(messages, key)) return messages.ai_statusError;
  return messages[key as keyof typeof messages] as string;
}
