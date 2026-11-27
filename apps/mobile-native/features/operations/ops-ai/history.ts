import { z } from "zod";
import {
  OpsAiActionProposalV2Schema, OpsAiCitationSchema, OpsAiErrorDataSchema, OpsAiWorkStepSchema, type OpsAiActionProposalV2,
} from "../../../../../lib/admin-ops-ai/chat-contract";
import { OpsFollowupSchema } from "../../../../../lib/admin-ops-ai/followups";
import type { NativeSessionScope } from "../../../network/transport";
import type { ApprovalChoice } from "./client";

const chatId = z.string().regex(/^[\w-]{1,100}$/);
const proposalId = z.string().regex(/^prop-[a-f0-9-]{36}$/);
const messageSchema = z.object({
  id: z.string(),
  role: z.enum(["assistant", "user", "system"]),
  content: z.string(),
  createdAt: z.number(),
  citations: z.array(OpsAiCitationSchema).optional(),
  workSteps: z.array(OpsAiWorkStepSchema).optional(),
  proposals: z.array(OpsAiActionProposalV2Schema).optional(),
  followups: z.array(OpsFollowupSchema).optional(),
  error: OpsAiErrorDataSchema.omit({ details: true }).strip().optional(),
});

const outcomeSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("unknown"), choice: z.enum(["once", "chat"]) }),
  z.object({ state: z.literal("done"), message: z.string().optional() }),
  z.object({ state: z.literal("failed"), message: z.string().optional() }),
  z.object({ state: z.literal("denied") }),
]);

const chatSchema = z.object({
  id: chatId,
  title: z.string(),
  mode: z.enum(["ask", "edit"]),
  messages: z.array(messageSchema),
  proposals: z.record(proposalId, z.object({
    sessionId: z.string().min(1),
    outcome: outcomeSchema.optional(),
    grantUntil: z.number().optional(),
  })),
});
const historySchema = z.object({ activeId: chatId, chats: z.array(chatSchema) });

export type OpsAiHistory = z.infer<typeof historySchema>;
export type OpsAiChat = z.infer<typeof chatSchema>;
export type OpsAiOutcome = z.infer<typeof outcomeSchema>;

export function newOpsAiChat(id: string): OpsAiChat {
  return { id, title: "", mode: "ask", messages: [], proposals: {} };
}

export function opsAiHistoryKey({ origin, accountId }: Pick<NativeSessionScope, "origin" | "accountId">) {
  return `zyx-native-ops-ai-v1:${JSON.stringify([origin, accountId])}`;
}

export function readOpsAiHistory(raw: string | null, blank: OpsAiChat): OpsAiHistory {
  if (raw) {
    try {
      const result = historySchema.safeParse(JSON.parse(raw));
      if (result.success && result.data.chats.some(chat => chat.id === result.data.activeId)) return result.data;
    } catch {
      // The caller can start a new conversation if the record is unreadable.
    }
  }
  return { activeId: blank.id, chats: [blank] };
}

export function redactOpsAiTokens(value: string) {
  // Streams and generated titles can end before the final token suffix arrives.
  return value.replace(/Zyx-[0-9a-f]{8}(?:-\d*)?(?:-\d*)?|Zyx-[0-9a-f]{1,7}(?=$|\s)/gi, "[token]");
}

export function serializeOpsAiHistory(history: OpsAiHistory): string {
  // A token can be repeated anywhere in a transcript, including a title or a citation.
  // The schema also projects approval outcomes onto fields that never include a token result.
  return JSON.stringify(historySchema.parse(history), (_key, value) =>
    typeof value === "string" ? redactOpsAiTokens(value) : value);
}

export function replaceOpsAiChat(history: OpsAiHistory, chat: OpsAiChat): OpsAiHistory {
  return { ...history, chats: history.chats.map(item => item.id === chat.id ? chat : item) };
}

export function removeOpsAiHistory(history: OpsAiHistory, action: { type: "delete" | "clear"; id: string } | { type: "all" }, blank: OpsAiChat): OpsAiHistory {
  if (action.type === "all") return { activeId: blank.id, chats: [blank] };
  if (action.type === "clear") {
    return { activeId: blank.id, chats: history.chats.map(chat => chat.id === action.id ? blank : chat) };
  }
  const chats = history.chats.filter(chat => chat.id !== action.id);
  return {
    activeId: history.activeId === action.id ? chats[0]?.id ?? blank.id : history.activeId,
    chats: chats.length ? chats : [blank],
  };
}

export function liveOpsAiGrants(chat: OpsAiChat, sessionId: string, now: number) {
  return Object.keys(chat.proposals).filter(id => {
    const approval = chat.proposals[id];
    return approval.sessionId === sessionId && (approval.grantUntil ?? 0) > now;
  });
}

export function beginOpsAiApproval(
  chat: OpsAiChat,
  proposal: OpsAiActionProposalV2,
  sessionId: string,
  choice: ApprovalChoice,
  verify: boolean,
  now: number,
): OpsAiChat["proposals"] | null {
  const authority = chat.proposals[proposal.id];
  if (authority?.sessionId !== sessionId ||
    (choice === "chat" && (proposal.type !== "admin_operation" || proposal.approval !== "chat")) ||
    (proposal.type === "admin_operation" && !proposal.approval)) return null;
  if (verify) {
    if (authority.outcome?.state !== "unknown" || authority.outcome.choice !== choice) return null;
  } else if (authority.outcome || proposal.status !== "pending" || (proposal.expiresAt ?? Infinity) <= now) {
    return null;
  }
  return { ...chat.proposals, [proposal.id]: { ...authority, outcome: { state: "unknown", choice } } };
}
