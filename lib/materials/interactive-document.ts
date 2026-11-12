import { z } from "zod";
import { inspectPayloadSecurity } from "./visual-payload-security";

const text = z.string().trim().min(1).max(2000);
const digest = z.string().regex(/^[a-f0-9]{64}$/);

export const interactiveDocumentSchema = z.object({
  id: z.string().trim().min(1).max(100),
  kind: z.literal("interactive_document"),
  version: z.literal(1),
  label: text,
  description: text,
  documentSha256: digest,
  documentBytes: z.number().int().min(1).max(6 * 1024 * 1024),
  printSha256: digest,
  printBytes: z.number().int().min(1).max(2 * 1024 * 1024),
  height: z.number().int().min(240).max(1200),
  staticFallback: z.object({ type: z.literal("text"), summary: text, content: text }).strict(),
  printCaption: text,
}).strict().superRefine((value, context) => {
  if (!inspectPayloadSecurity(value).safe || /https?:|data:|!?\[[^\]]*\]\([^)]*\)/i.test(JSON.stringify(value))) {
    context.addIssue({ code: "custom", message: "INTERACTIVE_DOCUMENT_METADATA_UNSAFE" });
  }
});

export type InteractiveDocumentSpec = z.infer<typeof interactiveDocumentSchema>;
