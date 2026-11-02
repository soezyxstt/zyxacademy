import { createHash } from "node:crypto";

export function buildLiveQuizLearningEventId(sessionId: string, userId: string, qi: number): string {
  const hash = createHash("sha256")
    .update(JSON.stringify(["live_quiz_answer", sessionId, userId, qi]))
    .digest("hex")
    .slice(0, 32);
  return `le_lq_${hash}`;
}
