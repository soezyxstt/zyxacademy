"use server";

import { getSessionDiscussionActor } from "./session";
import * as service from "./service";
import { validDiscussionId } from "./policy";
import type { CreateDiscussionThread, DiscussionChannelKind, DiscussionSendResult, DiscussionThreadStatus, ReplyToDiscussion } from "./contracts";

async function safe<T>(work: (actorId: string) => Promise<T>): Promise<T> {
 try { return await work((await getSessionDiscussionActor()).id); } catch (error) {
  const code = error instanceof Error ? error.message : "";
  const messages: Record<string, string> = {
   DISCUSSION_UNAVAILABLE: "Diskusi tidak tersedia atau akses Anda telah berubah.",
   DISCUSSION_INVALID: "Periksa kembali isi dan pilihan Anda.",
   DISCUSSION_RATE_LIMITED: "Terlalu banyak permintaan. Coba lagi nanti.",
   DISCUSSION_CONFLICT: "Data telah berubah. Muat ulang dan coba lagi.",
   DISCUSSION_RESOLVED: "Diskusi sudah selesai. Buka kembali untuk menjawab.",
   DISCUSSION_AI_SOURCE_CHANGED: "Isi diskusi telah berubah. Coba lagi.",
   DISCUSSION_AI_STAFF_REQUIRED: "Akses staf diperlukan untuk tindakan ini.",
   DISCUSSION_AI_INVALID_REQUEST: "Periksa kembali permintaan Anda.",
  };
  throw new Error(messages[code] ?? "Permintaan tidak dapat diproses. Coba lagi.");
 }
}

async function send(work: (actorId: string) => Promise<{ threadId: string; messageId: string }>): Promise<DiscussionSendResult> {
 try { return { ok: true, value: await work((await getSessionDiscussionActor()).id) }; } catch (error) {
  switch (error instanceof Error ? error.message : "") {
   case "DISCUSSION_UNAVAILABLE": return { ok: false, error: "unavailable" };
   case "DISCUSSION_INVALID": return { ok: false, error: "invalid" };
   case "DISCUSSION_RATE_LIMITED": return { ok: false, error: "rate_limited" };
   case "DISCUSSION_CONFLICT": return { ok: false, error: "conflict" };
   case "DISCUSSION_RESOLVED": return { ok: false, error: "resolved" };
   case "DISCUSSION_ATTACHMENT_EXPIRED": return { ok: false, error: "attachment_expired" };
   case "DISCUSSION_REPLAY_UNVERIFIED": {
    const target = error as Error & { threadId?: unknown; messageId?: unknown };
    return validDiscussionId(target.threadId) && validDiscussionId(target.messageId)
     ? { ok: false, error: "replay_unverified", value: { threadId: target.threadId, messageId: target.messageId } }
     : { ok: false, error: "unknown" };
   }
   default: return { ok: false, error: "unknown" };
  }
 }
}

export async function listChannels() { return safe(id => service.listChannels(id)); }
export async function getChannelsByIds(channelIds: string[]) { return safe(id => service.listChannels(id, channelIds)); }
export async function listChannelsPage(input: { cursor?: string; search?: string; courseId?: string; kind?: DiscussionChannelKind; kinds?: DiscussionChannelKind[]; limit?: number } = {}) { return safe(id => service.listChannelsPage(id, input)); }
export async function ensureTeamChannel(team: "technical" | "academic", courseId?: string) { return safe(id => service.ensureDiscussionTeamChannel(id, team, courseId)); }
export async function listThreads(channelId: string, cursor?: string) { return safe(id => service.listThreads(id, channelId, cursor)); }
export async function listThreadsAcrossChannels(input: { channelId?: string; search?: string; cursor?: string; status?: DiscussionThreadStatus } | string = {}) {
 return safe(id => service.listThreadsAcrossChannels(id, typeof input === "string" ? { cursor: input } : input));
}
export async function getThread(threadId: string, cursor?: string, targetMessageId?: string) { return safe(id => service.getThread(id, threadId, cursor, targetMessageId)); }
export async function createThread(input: CreateDiscussionThread) { return send(id => service.createThread(id, input)); }
export async function reply(input: ReplyToDiscussion) { return send(id => service.reply(id, input)); }
export async function edit(messageId: string, body: string, revision: number) { return safe(id => service.edit(id, messageId, body, revision)); }
export async function deleteMessage(messageId: string) { return safe(id => service.deleteMessage(id, messageId)); }
export async function forward(messageId: string, threadId: string, requestId: string) { return send(id => service.forward(id, messageId, threadId, requestId)); }
export async function setReaction(messageId: string, emoji: string, selected: boolean) { return safe(id => service.setReaction(id, messageId, emoji, selected)); }
export async function markRead(threadId: string, throughSeq: number, observationReceipt: string, messageIds: string[]) { return safe(id => service.markRead(id, threadId, throughSeq, observationReceipt, messageIds)); }
export async function setMute(channelId: string, muted: boolean) { return safe(id => service.setMute(id, channelId, muted)); }
export async function setResolved(threadId: string, resolved: boolean) { return safe(id => service.setResolved(id, threadId, resolved)); }
export async function searchMentions(threadId: string, query: string) { return safe(id => service.searchMentions(id, threadId, query)); }
export async function searchChannelMentions(channelId: string, query: string) { return safe(id => service.searchChannelMentions(id, channelId, query)); }
export async function report(messageId: string, reason: string) { return safe(id => service.report(id, messageId, reason)); }
export async function listReports(cursor?: string) { return safe(id => service.listReports(id, cursor)); }
export async function resolveReport(reportId: string, resolution: "resolved" | "dismissed") { return safe(id => service.resolveReport(id, reportId, resolution)); }
export async function classifyDiscussionWithStaffBudget(messageId: string, requestId: string) {
 return safe(async id => (await import("./ai")).classifyDiscussionWithStaffBudget({ actorId: id, messageId, requestId }));
}
