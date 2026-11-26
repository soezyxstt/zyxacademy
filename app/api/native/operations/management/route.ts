import { desc, eq, isNull } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { blogArticles, googleMeetSessions } from "@/db/schema";
import { getDiscountVouchers } from "@/app/(admin)/admin/pricing/actions";
import { getNativeOperationsAdmin } from "@/lib/auth/native-operations-admin";
import { BlogServiceError, getBlogArticle } from "@/lib/blog/service";
import { listThreadsAcrossChannels, getThread, listChannelMetadata } from "@/lib/discussions/service";
import { getCompleteMeetingAnalytics, listConferenceRecords } from "@/lib/google-meet";
import { getPricingDiscounts } from "@/lib/pricing-settings";
import type { Article, MeetingDetails, MeetingRecord, PricingData } from "@/packages/native-parity/operations/management-contract";

function reply(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function readMeetRecords(): Promise<MeetingRecord[]> {
  const [result, stored] = await Promise.all([
    listConferenceRecords(undefined, 50),
    db.select({ spaceName: googleMeetSessions.spaceName, meetingCode: googleMeetSessions.meetingCode, title: googleMeetSessions.title })
      .from(googleMeetSessions).where(isNull(googleMeetSessions.deletedAt)),
  ]);
  const titles = new Map(stored.flatMap(record => [[record.spaceName, record.title], [record.meetingCode, record.title]]));
  return Promise.all((result.conferenceRecords ?? []).map(async record => {
    const id = record.name.replace(/^conferenceRecords\//, "");
    const space = record.space?.replace(/^spaces\//, "");
    const title = titles.get(record.space) || titles.get(space) || `Meeting ${space || id.slice(0, 8)}`;
    const analytics = await getCompleteMeetingAnalytics(id).catch(() => undefined);
    return { id, title, startTime: record.startTime, endTime: record.endTime, participantCount: analytics?.participantCount, peakConcurrentParticipants: analytics?.peakConcurrentParticipants };
  }));
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
        const { items } = await listThreadsAcrossChannels(admin.user.id);
        const channelIds = [...new Set(items.map(thread => thread.channelId))];
        const channels = await listChannelMetadata(admin.user.id, channelIds);
        const titles = new Map(channels.map(channel => [channel.id, channel.title]));
        return reply(items.map(thread => ({ id: thread.id, title: thread.title, channel: titles.get(thread.channelId) ?? "", status: thread.status, messageCount: thread.answerCount, canReply: thread.canReply, canResolve: thread.canResolve })));
      }
      case "discussion": {
        if (!id) return reply({ error: "invalid" }, 400);
        const { messages } = await getThread(admin.user.id, id);
        return reply(messages.items.map(message => ({ id: message.id, author: message.author?.name ?? "Anonim", body: message.body })));
      }
      case "meetings": return reply(await readMeetRecords());
      case "meeting": return id ? reply(await readMeetDetails(id)) : reply({ error: "invalid" }, 400);
      default: return reply({ error: "not-found" }, 404);
    }
  } catch (error) {
    if (error instanceof BlogServiceError && error.code === "NOT_FOUND") return reply({ error: "not-found" }, 404);
    if (error instanceof Error && error.message === "DISCUSSION_UNAVAILABLE") return reply({ error: "not-found" }, 404);
    return reply({ error: "unavailable" }, 503);
  }
}
