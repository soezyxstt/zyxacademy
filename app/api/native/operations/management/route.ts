import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { blogArticles, googleMeetSessions, session } from "@/db/schema";
import { getDiscountVouchers } from "@/app/(admin)/admin/pricing/actions";
import { getAuthSession } from "@/lib/auth-session";
import { nativeAuthoringMutation, nativeAuthoringStatus } from "./authoring";
import { invokeOperationsProvider, isProviderOperation, nativeProviderMutation } from "./provider";
import { isDiscussionOperation, nativeDiscussionMutation } from "./discussions";
import { getNativeOperationsAdmin } from "@/lib/auth/native-operations-admin";
import { BlogServiceError, getBlogArticle } from "@/lib/blog/service";
import { listThreadsAcrossChannels, getThread, listChannelMetadata } from "@/lib/discussions/service";
import { getCompleteMeetingAnalytics, listConferenceRecords } from "@/lib/google-meet";
import { getPricingDiscounts } from "@/lib/pricing-settings";
import { ManagementFailure, type Article, type ManagementPage, type MeetingDetails, type MeetingRecord, type PricingData } from "@/packages/native-parity/operations/management-contract";

function reply(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function readMeetRecords(cursor?: string): Promise<ManagementPage<MeetingRecord>> {
  const [result, stored] = await Promise.all([
    listConferenceRecords(undefined, 50, cursor),
    db.select({ spaceName: googleMeetSessions.spaceName, meetingCode: googleMeetSessions.meetingCode, title: googleMeetSessions.title })
      .from(googleMeetSessions).where(isNull(googleMeetSessions.deletedAt)),
  ]);
  const titles = new Map(stored.flatMap(record => [[record.spaceName, record.title], [record.meetingCode, record.title]]));
  const items = await Promise.all((result.conferenceRecords ?? []).map(async record => {
    const id = record.name.replace(/^conferenceRecords\//, "");
    const space = record.space?.replace(/^spaces\//, "");
    const title = titles.get(record.space) || titles.get(space) || `Meeting ${space || id.slice(0, 8)}`;
    const analytics = await getCompleteMeetingAnalytics(id).catch(() => undefined);
    return { id, title, startTime: record.startTime, endTime: record.endTime, participantCount: analytics?.participantCount, peakConcurrentParticipants: analytics?.peakConcurrentParticipants };
  }));
  return { items, nextCursor: result.nextPageToken };
}

async function readMeetDetails(id: string): Promise<MeetingDetails> {
  const analytics = await getCompleteMeetingAnalytics(id);
  const [record] = await db.select({ title: googleMeetSessions.title }).from(googleMeetSessions)
    .where(eq(googleMeetSessions.spaceName, analytics.spaceName)).limit(1);
  return {
    id, title: record?.title || `Meeting ${id.slice(0, 8)}`, startTime: analytics.startTime, endTime: analytics.endTime,
    totalDurationSeconds: analytics.totalDurationSeconds ?? 0, participantCount: analytics.participantCount, peakConcurrentParticipants: analytics.peakConcurrentParticipants,
    participants: analytics.participants.map(person => ({ id: person.participantId, name: person.displayName, userType: person.userType, totalDurationSeconds: person.totalDurationSeconds, sessions: person.sessions })),
    recordings: analytics.recordings.map(rec => ({ id: rec.recordingId, url: rec.driveExportUri, startTime: rec.startTime })),
    transcripts: analytics.transcripts.map(entry => ({ id: entry.transcriptId, lines: entry.entries.length })),
  };
}

export async function GET(request: NextRequest) {
  try {
    const admin = await getNativeOperationsAdmin();
    if (!admin.ok) return reply({ error: "forbidden" }, admin.status);
    const boundAccount = request.headers.get("x-native-operations-user-id");
    if (boundAccount !== admin.user.id) return reply({ error: "forbidden" }, 403);
    const params = request.nextUrl.searchParams;
    const view = params.get("view");
    const id = params.get("id");
    const cursor = params.get("cursor") ?? undefined;
    if (cursor && cursor.length > 4096) return reply({ error: "invalid" }, 400);
    if (id !== null && !/^[A-Za-z0-9_-]{1,180}$/.test(id)) return reply({ error: "invalid" }, 400);
    switch (view) {
      case "articles": {
        const items = await db.query.blogArticles.findMany({ orderBy: [desc(blogArticles.createdAt)], with: { author: { columns: { name: true } } } });
        return reply(items.map(article => ({ id: article.id, title: article.title, slug: article.slug, category: article.category, status: article.status, author: article.author?.name ?? "Anonim" })));
      }
      case "article": {
        if (!id) return reply({ error: "invalid" }, 400);
        const article = await getBlogArticle(admin.user.id, id);
        const fields: Article = { id, slug: article.slug, title: article.title, content: article.content, summary: article.summary ?? "", category: article.category, status: article.status, thumbnailUrl: article.thumbnailUrl ?? "", tags: article.tags ?? [], author: "", revision: article.revision };
        return reply(fields);
      }
      case "pricing": {
        const [discounts, vouchers] = await Promise.all([getPricingDiscounts(), getDiscountVouchers()]);
        if (!vouchers.success || !vouchers.data) return reply({ error: "unavailable" }, 503);
        const result: PricingData = { discounts, now: new Date().toISOString(), vouchers: vouchers.data.map(voucher => ({ id: voucher.id, code: voucher.code, discountPercent: voucher.discountPercent, maxQuota: voucher.maxQuota, usedCount: voucher.usedQuota, expiresAt: voucher.expiresAt.toISOString(), description: voucher.description ?? "", isActive: voucher.isActive })) };
        return reply(result);
      }
      case "discussions": {
        const status = params.get("status");
        if (status && status !== "open" && status !== "resolved") return reply({ error: "invalid" }, 400);
        const search = params.get("search")?.slice(0, 120);
        const { items, nextCursor } = await listThreadsAcrossChannels(admin.user.id, { cursor, search, status: status === "open" || status === "resolved" ? status : undefined });
        const channelIds = [...new Set(items.map(thread => thread.channelId))];
        const channels = await listChannelMetadata(admin.user.id, channelIds);
        const titles = new Map(channels.map(channel => [channel.id, channel.title]));
        return reply({ items: items.map(thread => ({ id: thread.id, title: thread.title, channel: titles.get(thread.channelId) ?? "", status: thread.status, messageCount: thread.answerCount, canReply: thread.canReply, canResolve: thread.canResolve })), nextCursor: nextCursor ?? undefined });
      }
      case "discussion": {
        if (!id) return reply({ error: "invalid" }, 400);
        const { messages, readThroughSeq } = await getThread(admin.user.id, id, cursor);
        return reply({ items: messages.items.map(message => ({ id: message.id, author: message.author?.name ?? "Anonim", body: message.body, seq: message.seq })), observationReceipt: messages.observationReceipt, nextCursor: messages.nextCursor ?? undefined, throughSeq: readThroughSeq });
      }
      case "meetings": return reply(await readMeetRecords(cursor));
      case "meeting": return id ? reply(await readMeetDetails(id)) : reply({ error: "invalid" }, 400);
      default: return reply({ error: "not-found" }, 404);
    }
  } catch (error) {
    if (error instanceof BlogServiceError && error.code === "NOT_FOUND") return reply({ error: "not-found" }, 404);
    if (error instanceof Error && error.message === "DISCUSSION_UNAVAILABLE") return reply({ error: "not-found" }, 404);
    return reply({ error: "unavailable" }, 503);
  }
}

const maximumPayloadBytes = 1024 * 1024;

async function readAction(request: NextRequest): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > maximumPayloadBytes) throw new ManagementFailure("payload-too-large");
  if (!request.body) throw new ManagementFailure("invalid");
  const reader = request.body.getReader();
  let size = 0;
  let text = "";
  const decode = new TextDecoder();
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maximumPayloadBytes) {
        await reader.cancel();
        throw new ManagementFailure("payload-too-large");
      }
      text += decode.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decode.decode()) as unknown;
  } catch (error) {
    if (error instanceof ManagementFailure) throw error;
    throw new ManagementFailure("invalid");
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return reply({ error: "forbidden" }, 403);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return reply({ error: "expected-json" }, 415);
  try {
    const admin = await getNativeOperationsAdmin();
    if (!admin.ok) return reply({ error: "forbidden" }, admin.status);
    const auth = await getAuthSession();
    const sessionId = auth?.session?.id;
    if (!sessionId || auth.user.id !== admin.user.id || request.headers.get("x-native-operations-user-id") !== admin.user.id || request.headers.get("x-native-operations-session-id") !== sessionId) return reply({ error: "forbidden" }, 403);
    const action = await readAction(request);
    const requestKey = request.headers.get("x-native-operations-request-key");
    if (isDiscussionOperation(action)) {
      const [active] = await db.select({ id: session.id }).from(session).where(and(eq(session.id, sessionId), eq(session.userId, admin.user.id), gt(session.expiresAt, new Date()))).limit(1);
      if (!active) return reply({ error: "forbidden" }, 403);
      return reply(await nativeDiscussionMutation(admin.user.id, requestKey, action));
    }
    const actor = { id: admin.user.id, sessionId };
    if (isProviderOperation(action)) return reply(await nativeProviderMutation(actor, request.nextUrl.origin, requestKey, action, invokeOperationsProvider(request.nextUrl.origin, request.headers)));
    return reply(await nativeAuthoringMutation(actor, request.nextUrl.origin, requestKey, action));
  } catch (error) {
    const status = nativeAuthoringStatus(error);
    const codes: Partial<Record<number, string>> = { 400: "invalid", 403: "forbidden", 404: "not-found", 409: "conflict", 413: "payload-too-large", 424: "uncertain", 425: "pending" };
    return reply({ error: codes[status] ?? "unavailable" }, status);
  }
}
