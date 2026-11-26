import "server-only";
import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { user, weeklyReflections } from "@/db/schema";
import { checkFullCourseContentAccess } from "@/app/(student)/dashboard/actions";
import { getStudentStudyGroups } from "@/app/(student)/dashboard/groups/actions";
import { getScheduleData } from "@/app/(student)/dashboard/schedule/actions";
import { getGoogleCalendarStatus } from "@/app/actions/google-calendar";
import { getCourse, getCourseLeaderboard } from "@/lib/course-utils";
import { listCurrentEnrolledCourses } from "@/lib/student/current-enrolled-courses";
import { listStudentEnrollments } from "@/lib/student/course-catalog";
import { getStudentCalendarAgenda } from "@/lib/student/calendar-agenda";
import { getAchievementBadges, getGamificationMissions, getGamificationRewards, getGamificationSummary } from "@/lib/gamification/queries";
import { getPrivateProfileAggregates } from "@/lib/gamification/profile-aggregate";
import { getStudentSocialSettings, getVisibleStudentIdentities } from "@/lib/gamification/social";
import { getEmailNotificationPreferences } from "@/lib/email-preferences/repository";
import { getActivityNotificationPreferences } from "@/lib/notifications/activity-preferences";
import { getJakartaCalendarDate } from "@/lib/date-utils";
import { addTutorialDays, canBookTutorialSlot } from "@/lib/schedule/week-policy";
import { getPeranCodes } from "@/lib/auth/authorization";
import { summarizeCourseLeaderboard } from "@/lib/student/course-leaderboard";
import type { AcademicRanking, AchievementTab, CourseRanking, Group, NotificationPreferences, RankingRow, Schedule } from "@/packages/native-parity/student/community/contracts";

type Ranked = Awaited<ReturnType<typeof getCourseLeaderboard>>;

function projectRankings(userId: string, rows: Ranked, identities: Awaited<ReturnType<typeof getVisibleStudentIdentities>>): RankingRow[] {
  return rows.map(row => ({
    name: row.studentName, rank: row.rank, average: row.avgScore, attempts: row.attemptCount,
    identity: identities.get(row.studentId) ?? null, isSelf: row.studentId === userId,
  }));
}

export async function getNativeAcademicRanking(userId: string, requestedCourse?: string): Promise<AcademicRanking> {
  const enrollments = await listCurrentEnrolledCourses(userId);
  const courses = enrollments.map(({ id, title }) => ({ id, title }));
  const courseId = requestedCourse
    ? enrollments.find(course => course.id === requestedCourse || course.canonicalId === requestedCourse)?.id ?? null : null;
  const ranked = await Promise.all(courses.filter(course => courseId === null || course.id === courseId).map(async course =>
    ({ course, rows: (await getCourseLeaderboard(course.id).catch(() => [])).slice(0, 10) })));
  const ids = ranked.flatMap(board => board.rows.map(row => row.studentId));
  const identities = ids.length ? await getVisibleStudentIdentities(userId, ids).catch(() => new Map()) : new Map();
  return { courses, courseId, boards: ranked.map(({ course, rows }) => ({ course, rows: projectRankings(userId, rows, identities) })) };
}

export async function getNativeCourseRanking(userId: string, id: string, assessment: "quiz" | "simulation"): Promise<CourseRanking | null> {
  const course = await getCourse(id);
  if (!course) return null;
  if (!await checkFullCourseContentAccess(id)) throw new Error("Forbidden");
  const rankedRows = await getCourseLeaderboard(id, assessment);
  const { topRows, ownRank, totalStudents } = summarizeCourseLeaderboard(rankedRows, userId);
  const identities = topRows.length ? await getVisibleStudentIdentities(userId, topRows.map(row => row.studentId)).catch(() => new Map()) : new Map();
  return {
    course: { id, title: course.title }, assessment, ownRank, totalStudents,
    rows: topRows.map(row => ({
      rank: row.rank, name: row.studentName, average: row.avgScore, attempts: row.attemptCount,
      identity: identities.get(row.studentId) ?? null, isSelf: row.studentId === userId,
      averageDurationSeconds: row.avgDuration, correctHardCount: row.correctHardCount, attemptedMediumCount: row.attemptedMediumCount,
    })),
  };
}

export async function getNativeAchievements(userId: string, tab: AchievementTab) {
  const [summary, badges, missions, rewards] = await Promise.all([
    tab === "overview" || tab === "rewards" ? getGamificationSummary(userId) : null,
    tab === "overview" || tab === "badges" ? getAchievementBadges(userId) : [],
    tab === "missions" ? getGamificationMissions(userId) : [],
    tab === "rewards" ? getGamificationRewards(userId) : [],
  ]);
  return { summary, badges, missions, rewards };
}

export async function getNativePet(userId: string) {
  const [items, summary] = await Promise.all([getGamificationRewards(userId), getGamificationSummary(userId)]);
  return { summary, items: items.filter(item => item.slot === "zyra_avatar" || item.slot === "pet_action" || item.slot === "pet_suit") };
}

export async function getNativeCalendarStatus(userId: string) {
  const roles = await getPeranCodes(userId);
  return roles.some(role => role === "murid" || role === "tutor") ? getGoogleCalendarStatus() : null;
}

export async function getNativeCalendar(userId: string) {
  const [events, sync] = await Promise.all([
    getStudentCalendarAgenda(userId),
    getNativeCalendarStatus(userId).catch(() => null),
  ]);
  return { events, sync };
}

export async function getNativeGroups(): Promise<Group[]> {
  return (await getStudentStudyGroups()).map(group => ({
    id: group.id, name: group.name, status: group.status, packageName: group.packageName,
    remainingQuota: group.remainingQuota, weeklyRemainingQuota: group.weeklyRemainingQuota,
    courses: group.courses.map(({ id, title }) => ({ id, title })),
    members: group.members.map(({ id, name, role, isMe, identity }) => ({ id, name, role, isMe, identity })),
    token: group.token && group.members.length < group.token.capacity ? { value: group.token.token, capacity: group.token.capacity, expiresAt: group.token.expiresAt?.toISOString() ?? null } : null,
  }));
}

export async function getNativeSchedule(userId: string, offset: number, courseId?: string): Promise<Schedule> {
  const schedule = await getScheduleData(offset, courseId);
  return {
    week: schedule.weekRange,
    dates: Array.from({ length: 7 }, (_, index) => addTutorialDays(schedule.weekRange.startIso, index)),
    todayDate: getJakartaCalendarDate(),
    locked: schedule.isWeekLocked,
    courses: schedule.enrollments.map(({ course }) => ({ id: course.id, title: course.title })),
    groups: schedule.groups.map(group => ({ id: group.id, name: group.name, courseIds: group.courses.map(course => course.courseId) })),
    slots: schedule.availableSlots.flatMap(slot => slot.sessionDate ? [{
      id: slot.id, date: slot.sessionDate, startTime: slot.startTime, endTime: slot.endTime,
      tutor: slot.tutor?.name ?? "", courseIds: slot.matchedCourseIds, occupied: Boolean(slot.booking), bookable: canBookTutorialSlot(slot.sessionDate, slot.startTime),
    }] : []),
    bookings: schedule.groupBookings.map(booking => ({
      id: booking.id, courseId: booking.courseId, course: booking.course.title, group: booking.group?.name ?? null, tutor: booking.slot.tutor?.name ?? "",
      date: booking.sessionDate ?? "", startTime: booking.startTime ?? booking.slot.startTime, endTime: booking.endTime ?? booking.slot.endTime,
      topic: booking.topic, notes: booking.preSessionNotes, status: booking.status, meetUrl: booking.googleMeetUrl,
      resources: booking.resources.map(resource => ({ id: resource.id, title: resource.label, url: resource.url, canDelete: resource.phase === "pre" && resource.createdById === userId })),
      tickets: booking.rescheduleTickets.map(ticket => ({ id: ticket.id, status: ticket.status, reason: ticket.reason,
        messages: ticket.messages.map(message => ({ id: message.id, body: message.message, sender: message.sender?.name ?? "" })) })),
    })),
    academic: schedule.academicSchedules.map(event => ({
      id: event.id, title: event.title, dateId: getJakartaCalendarDate(event.startDate), startTime: event.startDate.toISOString(), endTime: event.endDate?.toISOString() ?? "",
    })),
  };
}

export async function getNativeProfile(userId: string, gamification: boolean, includeStats: boolean) {
  const [account] = await db.select({
    name: user.name, email: user.email, image: user.image, faculty: user.faculty, major: user.major, entryYear: user.entryYear,
  }).from(user).where(eq(user.id, userId)).limit(1);
  if (!account) return null;
  if (!gamification) return { account, customization: null, summary: null, courses: [], stats: null };
  const [settings, badges, rewards, summary, enrollments] = await Promise.all([
    getStudentSocialSettings(userId), getAchievementBadges(userId), getGamificationRewards(userId),
    includeStats ? getGamificationSummary(userId) : null,
    includeStats ? listStudentEnrollments(userId) : [],
  ]);
  const courses = enrollments.map(({ id, title }) => ({ id, title }));
  const figures = includeStats ? await getPrivateProfileAggregates(userId, courses.map(course => course.id)) : null;
  const stats = figures ? { completedMaterials: figures.completedCount, completedExams: figures.submissionCount, averageScore: figures.averageScore } : null;
  return { account, customization: { settings, badges, rewards }, summary, courses, stats };
}

export async function getNativeReflections(userId: string, before?: string) {
  const pageSize = 30;
  const rows = await db.select({ id: weeklyReflections.id, weekStart: weeklyReflections.weekStart, payload: weeklyReflections.payload })
    .from(weeklyReflections).where(and(eq(weeklyReflections.studentId, userId), before ? lt(weeklyReflections.weekStart, before) : undefined))
    .orderBy(desc(weeklyReflections.weekStart)).limit(pageSize + 1);
  const entries = rows.slice(0, pageSize);
  return { entries, nextCursor: rows.length > pageSize ? entries.at(-1)?.weekStart ?? null : null };
}

export async function getNativeNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  const [email, activity, roles] = await Promise.all([
    getEmailNotificationPreferences(userId), getActivityNotificationPreferences(userId), getPeranCodes(userId),
  ]);
  return {
    email: { emailEnabled: email.emailEnabled, courseUpdates: email.courseUpdates, eventsAndSchedules: email.eventsAndSchedules,
      learningReminders: email.learningReminders, newsAndOffers: email.newsAndOffers },
    activity,
    canUseTutorialAvailability: roles.includes("tutor"),
  };
}
