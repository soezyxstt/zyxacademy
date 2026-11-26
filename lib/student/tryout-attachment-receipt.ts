import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

export type TryoutAttachmentClaim = {
  userId: string;
  examId: string;
  questionId: string;
  requestId: string;
  fileKey: string;
  fileName: string;
  fileSize?: string;
};

export function signTryoutAttachment(input: TryoutAttachmentClaim): string {
  const { userId, examId, questionId, requestId, fileKey, fileName, fileSize } = input;
  return createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(JSON.stringify(["native-tryout-attachment-v1", userId, examId, questionId, requestId, fileKey, fileName, fileSize ?? ""]))
    .digest("hex");
}

export function verifyTryoutAttachment(input: TryoutAttachmentClaim, receipt: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(receipt)) return false;
  return timingSafeEqual(Buffer.from(receipt, "hex"), Buffer.from(signTryoutAttachment(input), "hex"));
}
