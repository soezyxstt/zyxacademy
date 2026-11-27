import { createHash } from "node:crypto";

/** Caller keys replay within the same domain, authenticated student and assessment. */
export function studentAssessmentRequestId(domain: "quiz" | "tryout", userId: string, assessmentId: string, requestId: string): string {
  return createHash("sha256").update(JSON.stringify([domain, userId, assessmentId, requestId.toLowerCase()])).digest("hex");
}
