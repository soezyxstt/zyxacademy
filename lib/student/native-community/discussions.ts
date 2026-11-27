import "server-only";
import { z } from "zod";
import * as actions from "@/lib/discussions/actions";

const id = z.string().min(1).max(160);
const message = z.string().max(12000);
const submit = {
  body: message, attachmentIds: z.array(id).max(4), mentionIds: z.array(id).max(10),
  mentionHandles: z.array(z.string().min(1).max(64)).max(10).optional(), requestId: id,
  askZyra: z.boolean(), skinId: id.nullable().optional(),
};
const operation = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("create"), input: z.strictObject({ ...submit, channelId: id, title: z.string().max(160).optional() }) }),
  z.strictObject({ action: z.literal("answer"), input: z.strictObject({ ...submit, threadId: id }) }),
  z.strictObject({ action: z.literal("reply"), input: z.strictObject({ ...submit, threadId: id, replyTo: id }) }),
  z.strictObject({ action: z.literal("edit"), messageId: id, body: message, revision: z.number().int().nonnegative() }),
  z.strictObject({ action: z.literal("delete"), messageId: id }),
  z.strictObject({ action: z.literal("forward"), messageId: id, threadId: id, requestId: id }),
  z.strictObject({ action: z.literal("reaction"), messageId: id, emoji: z.string().max(16), selected: z.boolean() }),
  z.strictObject({ action: z.literal("read"), threadId: id, throughSeq: z.number().int().nonnegative(),
    receipt: z.string().min(1).max(8192), messageIds: z.array(id).min(1).max(30) }),
  z.strictObject({ action: z.literal("mute"), channelId: id, muted: z.boolean() }),
  z.strictObject({ action: z.literal("resolve"), threadId: id, resolved: z.boolean() }),
  z.strictObject({ action: z.literal("mentions"), threadId: id, search: z.string().min(1).max(80) }),
  z.strictObject({ action: z.literal("channel-mentions"), channelId: id, search: z.string().min(1).max(80) }),
  z.strictObject({ action: z.literal("author"), threadId: id, authorId: id }),
  z.strictObject({ action: z.literal("report"), messageId: id, reason: z.string().trim().min(1).max(500) }),
]);

export async function runNativeDiscussionAction(raw: unknown) {
  const input = operation.parse(raw);
  switch (input.action) {
    case "create": return actions.createThread(input.input);
    case "answer": return actions.reply({ ...input.input, messageType: "answer" });
    case "reply": return actions.reply({ ...input.input, messageType: "reply" });
    case "edit": await actions.edit(input.messageId, input.body, input.revision); break;
    case "delete": await actions.deleteMessage(input.messageId); break;
    case "forward": return actions.forward(input.messageId, input.threadId, input.requestId);
    case "reaction": await actions.setReaction(input.messageId, input.emoji, input.selected); break;
    case "read": await actions.markRead(input.threadId, input.throughSeq, input.receipt, input.messageIds); break;
    case "mute": await actions.setMute(input.channelId, input.muted); break;
    case "resolve": await actions.setResolved(input.threadId, input.resolved); break;
    case "mentions": return actions.searchMentions(input.threadId, input.search);
    case "channel-mentions": return actions.searchChannelMentions(input.channelId, input.search);
    case "author": return actions.getAuthorProfile(input.threadId, input.authorId);
    case "report": await actions.report(input.messageId, input.reason); break;
  }
  return { success: true };
}
