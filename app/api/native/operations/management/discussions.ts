import { z } from "zod";
import { markRead, reply, setResolved } from "@/lib/discussions/service";
import { ManagementFailure } from "@/packages/native-parity/operations/management-contract";

const id = z.string().min(1).max(160);
const operations = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("discussion.reply"), id, body: z.string().trim().min(1).max(12_000) }),
  z.strictObject({ type: z.literal("discussion.resolve"), id, resolved: z.boolean() }),
  z.strictObject({ type: z.literal("discussion.read"), id, throughSeq: z.number().int().nonnegative(), observationReceipt: z.string().min(1).max(50_000), messageIds: z.array(id).max(100) }),
]);

export function isDiscussionOperation(value: unknown) {
  return value !== null && typeof value === "object" && "type" in value && typeof value.type === "string" && value.type.startsWith("discussion.");
}

export async function nativeDiscussionMutation(actorId: string, requestKey: string | null, input: unknown) {
  const action = operations.parse(input);
  try {
    switch (action.type) {
      case "discussion.reply": {
        const requestId = z.string().regex(/^[A-Za-z0-9_-]{16,100}$/).parse(requestKey);
        const result = await reply(actorId, { threadId: action.id, messageType: "answer", body: action.body, attachmentIds: [], mentionIds: [], askZyra: false, requestId });
        return { id: result.messageId };
      }
      case "discussion.resolve":
        await setResolved(actorId, action.id, action.resolved);
        return { id: action.id };
      case "discussion.read":
        await markRead(actorId, action.id, action.throughSeq, action.observationReceipt, action.messageIds);
        return { id: action.id };
    }
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    if (error.message === "DISCUSSION_UNAVAILABLE") throw new ManagementFailure("not-found");
    if (error.message === "DISCUSSION_INVALID") throw new ManagementFailure("invalid");
    if (["DISCUSSION_CONFLICT", "DISCUSSION_RESOLVED", "DISCUSSION_REPLAY_UNVERIFIED"].includes(error.message)) throw new ManagementFailure("conflict");
    throw error;
  }
}
