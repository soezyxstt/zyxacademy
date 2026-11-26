import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getCourseVideosData } from "@/app/actions/video-actions";
import { db } from "@/db";
import { aiMaterialInstances, liveQuizSessions, quizTemplates } from "@/db/schema";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import { getAuthSession } from "@/lib/auth-session";
import { ensureLegacyIdentity } from "@/lib/auth/legacy-identity";
import { hasAnyPeran, listTutorAccessibleCourses, requireTutorCourseAccess } from "@/lib/auth/request-cache";
import { requireDiscussionThreadAccess } from "@/lib/discussions/access";
import { reply } from "@/lib/discussions/actions";
import { getThread, listChannelMetadataPage, listThreadsAcrossChannels } from "@/lib/discussions/service";
import { env } from "@/lib/env";
import { addCalendarDays, getCalendarWeekRange, getJakartaCalendarDate } from "@/lib/schedule/calendar-date";
import { getTutorScheduleReadModel } from "@/lib/schedule/tutor-read-model";
import { cleanSummary } from "@/lib/utils";
import type { TutorSupportServices } from "./handle-tutor-support";

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
    return {
      from, to,
      slots: schedule.ownedSlots.flatMap(({ id, sessionDate, startTime, endTime, mode, location, booking }) =>
        sessionDate ? [{ id, date: sessionDate, start: startTime, end: endTime, mode, location, booked: Boolean(booking) }] : [],
      ),
      sessions: schedule.ownedBookings.map(({ id, sessionDate, startTime, endTime, course, group, topic, status }) => ({
        id, date: sessionDate, start: startTime, end: endTime, courseTitle: course?.title ?? null, groupName: group?.name ?? null, topic, status,
      })),
      tickets: schedule.ownedTickets.map(({ id, type, status, reason, proposedDate }) => ({ id, type, status, reason, proposedDate })),
      groups: schedule.eligibleGroups.map(({ id, name, packageName, usedQuotaSessions, totalQuotaSessions, membersCount }) => ({
        id, name, packageName, used: usedQuotaSessions, total: totalQuotaSessions, members: membersCount,
      })),
    };
  },
  async discussions(userId, courseId, search, cursor) {
    const channelId = courseId ? await courseChannel(userId, courseId) : undefined;
    if (courseId && !channelId) return { items: [], nextCursor: null };
    const result = await listThreadsAcrossChannels(userId, { channelId, search, cursor });
    return { items: result.items.map(({ id, title, status, answerCount, canReply }) => ({ id, title, status, answerCount, canReply })), nextCursor: result.nextCursor };
  },
  async discussion(userId, courseId, threadId, cursor, targetMessageId) {
    if (courseId) await requireCourseThread(userId, courseId, threadId);
    const { thread: { id, title, status, answerCount, canReply }, messages } = await getThread(userId, threadId, cursor, targetMessageId);
    return {
      thread: { id, title, status, answerCount, canReply },
      messages: {
        items: messages.items.map(({ id, seq, author, body, attachments, messageType }) => ({
          id, seq, author: author?.name ?? null, body, attachmentCount: attachments.length, messageType,
        })),
        nextCursor: messages.nextCursor,
      },
    };
  },
  async answer(userId, courseId, threadId, draft) {
    if (courseId) await requireCourseThread(userId, courseId, threadId);
    return reply({ ...draft, threadId, messageType: "answer", attachmentIds: [], mentionIds: [], askZyra: false });
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
    if (env.FEATURE_LIVE !== "1" || !env.NEXT_PUBLIC_REALTIME_URL) {
      return { configured: false, templates: [], active: null };
    }
    const courseIds = Array.from(new Set([access.courseId, access.legacyCourseId, courseId].filter((id): id is string => Boolean(id))));
    const [templates, sessions] = await Promise.all([
      db.select({ id: quizTemplates.id, title: quizTemplates.title, category: quizTemplates.category, rules: quizTemplates.selectionRules })
        .from(quizTemplates)
        .where(and(inArray(quizTemplates.courseId, courseIds), eq(quizTemplates.status, "published")))
        .orderBy(desc(quizTemplates.createdAt)),
      db.select({ id: liveQuizSessions.id, code: liveQuizSessions.code, state: liveQuizSessions.state, participantCount: liveQuizSessions.participantCount })
        .from(liveQuizSessions)
        .where(and(inArray(liveQuizSessions.courseId, courseIds), eq(liveQuizSessions.tutorId, userId)))
        .orderBy(desc(liveQuizSessions.createdAt)).limit(20),
    ]);
    return {
      configured: true,
      templates: templates.filter((template) => template.category !== "simulation" && !isTryout(template.rules))
        .map(({ id, title }) => ({ id, title })),
      active: (env.LIVE_HMAC_SECRET ? sessions.find((session) => session.state !== "ended") : undefined) ?? null,
    };
  },
} satisfies TutorSupportServices;
