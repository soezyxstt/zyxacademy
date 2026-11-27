import { createHash } from "node:crypto";

export function formResponseAttachmentFolder(formId: string) {
  return `response-${createHash("sha256").update(formId).digest("hex").slice(0, 40)}`;
}
