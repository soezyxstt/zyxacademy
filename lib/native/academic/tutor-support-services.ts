import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getCourseVideosData } from "@/app/actions/video-actions";
import { db } from "@/db";
import { aiMaterialInstances, liveQuizSessions, quizTemplates } from "@/db/schema";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import { getAuthSession } from "@/lib/auth-session";
import { ensureLegacyIdentity } from "@/lib/auth/legacy-identity";
import { hasAnyPeran, listTutorAccessibleCourses, requireTutorCourseAccess } from "@/lib/auth/request-cache";
import { requireDiscussionMessageAccess, requireDiscussionThreadAccess } from "@/lib/discussions/access";
import { reply } from "@/lib/discussions/actions";
import { getThread, listChannelMetadataPage, listThreadsAcrossChannels, markRead, setReaction, setResolved } from "@/lib/discussions/service";
import { env } from "@/lib/env";
import { listPublishedCodingProblems } from "@/lib/coding/published-problems";
import { addCalendarDays, getCalendarWeekRange, getJakartaCalendarDate } from "@/lib/schedule/calendar-date";
import { getTutorScheduleReadModel } from "@/lib/schedule/tutor-read-model";
import { cleanSummary } from "@/lib/utils";
import type { TutorSupportServices } from "./handle-tutor-support";
import { tutorSlotDetails } from "./tutor-slot-service";

async function readCourse(userId: string, courseId: string) {
  return requireTutorCourseAccess(userId, courseId, { allowAdmin: false });
}

async function courseChannel(userId: string, courseId: string) {
  const access = await readCourse(userId, courseId);
  const channels = await listChannelMetadataPage(userId, { courseId: access.courseId ?? courseId, kind: "course" });
  return channels.items[0]?.id;
}

async function requireCourseThread(userId: string, courseId: string, threadId: string) {
  const channelId = await courseChannel(userId, courseId);
  const { channel } = await requireDiscussionThreadAccess({ id: userId }, threadId);
  if (!channelId || channel.id !== channelId) throw new Error("DISCUSSION_UNAVAILABLE");
}

function isTryout(rules: unknown) {
  if (typeof rules === "string") {
    try { rules = JSON.parse(rules); } catch { return false; }
  }
  return rules !== null && typeof rules === "object" &&
    (rules as Record<string, unknown>).assessmentType === "tryout";
}

export const tutorSupportServices = {
  session: getAuthSession,
  async hasTutor(userId) {
    await ensureLegacyIdentity(userId);
    return hasAnyPeran(userId, ["tutor"], { allowAdmin: false });
  },
  async authorizeCourse(userId, courseId) {
    await readCourse(userId, courseId);
  },
  async schedule(userId, week) {
    const { startIso: from, endIso: to } = getCalendarWeekRange(addCalendarDays(getJakartaCalendarDate(), week * 7));
    const schedule = await getTutorScheduleReadModel({ tutorId: userId, allowAdmin: false, fromDate: from, toDate: to }, undefined, listTutorAccessibleCourses);
    const groupNames = new Map(schedule.eligibleGroups.map(group => [group.id, group.name]));
    const details = new Map((await tutorSlotDetails(userId, schedule.ownedSlots.map((slot) => slot.id))).map((slot) => [slot.id, slot]));
    return {
      from, to, courses: schedule.assignedActiveCourses.map(course => ({ id: course.courseId, title: course.title, legacyId: course.legacyCourseId })),
      slots: schedule.ownedSlots.flatMap(({ id, booking }) => {
        const slot = details.get(id);
        if (!slot?.date || slot.date < from || slot.date > to) return [];
        return [{ id, date: slot.date, start: slot.start, end: slot.end, mode: slot.mode, location: slot.location,
          notes: slot.notes, courseIds: slot.courseIds, booked: Boolean(booking), hasBookingHistory: slot.booked, revision: slot.booked ? undefined : slot.revision }];
      }),
      sessions: schedule.ownedBookings.map(({ id, slotId, sessionDate, startTime, endTime, course, group, topic, status }) => ({
        id, slotId, date: sessionDate, start: startTime, end: endTime, courseTitle: course?.title ?? null, groupName: group?.name ?? null, topic, status,
      })),
      tickets: schedule.ownedTickets.map(({ id, type, status, reason, proposedDate, decisionNotes, groupId, messages }) => ({
        id, type, status, reason, proposedDate, decisionNotes, groupName: groupNames.get(groupId) ?? null,
        messages: messages.map(({ id, senderName, message }) => ({ id, sender: senderName, message })),
      })),
      groups: schedule.eligibleGroups.map(({ id, name, packageName, usedQuotaSessions, totalQuotaSessions, membersCount }) => ({
        id, name, packageName, used: usedQuotaSessions, total: totalQuotaSessions, members: membersCount,
      })),
    };
  },
  async discussions(userId, courseId, search, cursor) {
    const channelId = courseId ? await courseChannel(userId, courseId) : undefined;
    if (courseId && !channelId) return { items: [], nextCursor: null };
    const result = await listThreadsAcrossChannels(userId, { channelId, search, cursor });
    return { items: result.items.map(({ id, title, status, answerCount, canReply, unreadCount }) => ({ id, title, status, answerCount, canReply, unreadCount })), nextCursor: result.nextCursor };
  },
  async discussion(userId, courseId, threadId, cursor, targetMessageId) {
    if (courseId) await requireCourseThread(userId, courseId, threadId);
    const { thread, messages, readThroughSeq } = await getThread(userId, threadId, cursor, targetMessageId);
    return {
      thread: { id: thread.id, title: thread.title, status: thread.status, answerCount: thread.answerCount, canReply: thread.canReply,
        channelId: thread.channelId, canResolve: thread.canResolve, unreadCount: thread.unreadCount },
      messages: {
        items: messages.items.map(({ id, seq, author, body, attachments, messageType, replyTo, reactions, canReply, canReact }) => ({
          id, seq, author: author?.name ?? null, body, attachments, attachmentCount: attachments.length, messageType, replyTo, reactions, canReply, canReact,
        })),
        nextCursor: messages.nextCursor,
      },
      observed: { receipt: messages.observationReceipt, throughSeq: readThroughSeq, items: messages.items.map(({ id, seq }) => ({ id, seq })) },
    };
  },
  async answer(userId, courseId, threadId, draft) {
    if (courseId) await requireCourseThread(userId, courseId, threadId);
    const input = { threadId, body: draft.body, requestId: draft.requestId, attachmentIds: draft.attachmentIds ?? [], mentionIds: [], askZyra: false };
    return reply(draft.replyTo ? { ...input, messageType: "reply", replyTo: draft.replyTo } : { ...input, messageType: "answer" });
  },
  async changeDiscussion(userId, courseId, threadId, change) {
    if (courseId) await requireCourseThread(userId, courseId, threadId);
    switch (change.action) {
      case "reaction": {
        const { thread } = await requireDiscussionMessageAccess({ id: userId, role: "tutor" }, change.messageId);
        if (thread.id !== threadId) throw new Error("DISCUSSION_UNAVAILABLE");
        await setReaction(userId, change.messageId, change.emoji, change.selected);
        break;
      }
      case "read":
        await markRead(userId, threadId, change.throughSeq, change.receipt, change.messageIds);
        break;
      case "resolve":
        await setResolved(userId, threadId, change.resolved);
        break;
    }
  },
  async materials(userId, courseId) {
    const access = await readCourse(userId, courseId);
    const course = await resolveCourseIdentity(access.courseId ?? courseId);
    if (!course) throw new Error("NOT_FOUND");
    const items = await db
      .select({ id: aiMaterialInstances.id, title: aiMaterialInstances.title, summary: aiMaterialInstances.summary })
      .from(aiMaterialInstances)
      .where(inArray(aiMaterialInstances.courseId, course.allIds))
      .orderBy(desc(aiMaterialInstances.createdAt));
    return { title: course.title, items: items.map(({ id, title, summary }) => ({ id, title, summary: cleanSummary(summary) })) };
  },
  async videos(userId, courseId) {
    const access = await readCourse(userId, courseId);
    const data = await getCourseVideosData(access.courseId ?? courseId);
    if (!data) throw new Error("NOT_FOUND");
    return {
      title: data.course.title,
      playlists: data.playlists.map(({ id, title, description, videos }) => ({
        id, title, description, videos: videos.map(({ id, title, duration, locked }) => ({ id, title, duration, locked: locked !== false })),
      })),
    };
  },
  async live(userId, courseId) {
    const access = await readCourse(userId, courseId);
    if (env.FEATURE_LIVE !== "1" || !env.NEXT_PUBLIC_REALTIME_URL || !env.LIVE_HMAC_SECRET) {
      return { configured: false, templates: [], active: null };
    }
    const courseIds = Array.from(new Set([access.courseId, access.legacyCourseId, courseId].filter((id): id is string => Boolean(id))));
    const [templates, sessions, problems] = await Promise.all([
      db.select({ id: quizTemplates.id, title: quizTemplates.title, category: quizTemplates.category, rules: quizTemplates.selectionRules })
        .from(quizTemplates)
        .where(and(inArray(quizTemplates.courseId, courseIds), eq(quizTemplates.status, "published")))
        .orderBy(desc(quizTemplates.createdAt)),
      db.select({ id: liveQuizSessions.id, code: liveQuizSessions.code, state: liveQuizSessions.state, participantCount: liveQuizSessions.participantCount })
        .from(liveQuizSessions)
        .where(and(inArray(liveQuizSessions.courseId, courseIds), eq(liveQuizSessions.tutorId, userId)))
        .orderBy(desc(liveQuizSessions.createdAt)).limit(20),
      access.courseId ? listPublishedCodingProblems(access.courseId) : [],
    ]);
    return {
      configured: true,
      codingProblems: problems.map(({ problemId, version, title }) => ({ problemId, version, title })),
      templates: templates.filter((template) => template.category !== "simulation" && !isTryout(template.rules))
        .map(({ id, title }) => ({ id, title })),
      active: sessions.find((session) => session.state !== "ended") ?? null,
    };
  },
} satisfies TutorSupportServices;
