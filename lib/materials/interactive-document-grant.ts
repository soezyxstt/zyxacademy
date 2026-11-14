import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const grantSchema = z.object({
  userId: z.string().min(1), articleId: z.string().min(1), articleVersion: z.number().int().positive(), sectionId: z.string().min(1), blockId: z.string().min(1),
  field: z.enum(["answer", "explanation"]), expires: z.number().int().positive(), draftId: z.string().min(1).optional(), draftChecksum: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict().refine((value) => Boolean(value.draftId) === Boolean(value.draftChecksum));
export type InteractiveDocumentGrant = z.infer<typeof grantSchema>;

function signature(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(`zyx-interactive-document-v1.${payload}`).digest();
}

export function mintInteractiveDocumentGrant(input: Omit<InteractiveDocumentGrant, "expires">, secret: string, now = Date.now()): string {
  if (!secret) throw new Error("INTERACTIVE_DOCUMENT_GRANT_SECRET_MISSING");
  const payload = Buffer.from(JSON.stringify(grantSchema.parse({ ...input, expires: now + 10 * 60 * 1000 }))).toString("base64url");
  return `${payload}.${signature(payload, secret).toString("base64url")}`;
}

export function verifyInteractiveDocumentGrant(token: string, userId: string, secret: string, now = Date.now()): InteractiveDocumentGrant | null {
  if (!secret || token.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null;
  const [payload, encoded] = token.split(".");
  const actual = Buffer.from(encoded, "base64url");
  const expected = signature(payload, secret);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const parsed = grantSchema.safeParse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    if (!parsed.success || parsed.data.userId !== userId || parsed.data.expires <= now || parsed.data.expires > now + 10 * 60 * 1000) return null;
    return parsed.data;
  } catch { return null; }
}
