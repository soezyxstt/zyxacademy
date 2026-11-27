import { createHash } from "node:crypto";

export function tutorHistoryMessageId(studentId: string, courseId: string, requestId: string, index: number) {
  return createHash("sha256").update(JSON.stringify([studentId, courseId, requestId, index])).digest("hex");
}
