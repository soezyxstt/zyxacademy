import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const id = z.string().min(1).max(160).refine(value => value.trim() === value && !value.includes("\0"));
const receiptSchema = z.object({
 userId: id, threadId: id, status: z.enum(["open", "resolved"]), statusRevision: z.number().int().nonnegative().safe(),
 messages: z.array(z.object({ id, seq: z.number().int().positive().safe(), revision: z.number().int().positive().safe() }).strict()).max(30),
}).strict().refine(value => new Set(value.messages.map(message => message.id)).size === value.messages.length);

export type DiscussionReadReceipt = z.infer<typeof receiptSchema>;

function signature(payload: string, secret: string) {
 return createHmac("sha256", secret).update(`zyx-discussion-read-v1.${payload}`).digest();
}

export function signDiscussionReadReceipt(value: DiscussionReadReceipt, secret: string) {
 if (!secret) throw new Error("DISCUSSION_RECEIPT_SECRET_MISSING");
 const payload = Buffer.from(JSON.stringify(receiptSchema.parse(value))).toString("base64url");
 return `${payload}.${signature(payload, secret).toString("base64url")}`;
}

export function verifyDiscussionReadReceipt(token: unknown, userId: string, threadId: string, secret: string): DiscussionReadReceipt | null {
 if (!secret || typeof token !== "string" || token.length > 65536 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null;
 const [payload, encoded] = token.split(".");
 const received = Buffer.from(encoded, "base64url"), expected = signature(payload, secret);
 if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
 try {
  const parsed = receiptSchema.safeParse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
  return parsed.success && parsed.data.userId === userId && parsed.data.threadId === threadId ? parsed.data : null;
 } catch { return null; }
}
