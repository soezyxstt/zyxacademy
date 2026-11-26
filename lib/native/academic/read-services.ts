import "server-only";
import { ensureLegacyIdentity } from "@/lib/auth/legacy-identity";
import { getAuthSession } from "@/lib/auth-session";
import { hasPeran, hasAnyPeran, listTutorAccessibleCourses, requireTutorCourseAccess } from "@/lib/auth/request-cache";
import { getCalendarWeekRange, getJakartaCalendarDate } from "@/lib/schedule/calendar-date";
import { getTutorDashboardReadModel } from "@/lib/schedule/tutor-dashboard-read-model";
import { getTutorCourseOverview } from "@/lib/tutor/course-overview-read-model";
import { getTutorCourseParticipants } from "@/lib/tutor/participant-read-model";
import { readAuthorizedTryoutGrading } from "@/lib/tutor/tryout-grading-read-model";
import { getCoursesWithStats, getCourseDetailData } from "@/app/(admin)/admin/(academic)/courses/actions";
import type { TutorDashboard, TutorGrading, TutorParticipants, TutorAnalytics } from "@/packages/native-parity/academic/tutor/model";
import type { AdminCourse, AdminCourseOverview } from "@/packages/native-parity/academic/courses/model";
import { projectTryoutSnapshots } from "./grading-snapshot";
import type { AcademicReadServices } from "./handle-read";
import { readAdminCourseSection } from "./course-section-reads";

function materialChapterIds(value: unknown): string[] {
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return []; }
  }
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}

export const academicReadServices = {
  session: getAuthSession,
  courseSection: readAdminCourseSection,
  async hasAdmin(userId) {
    await ensureLegacyIdentity(userId);
    return hasPeran(userId, "admin");
  },
  async hasTutor(userId) {
    await ensureLegacyIdentity(userId);
    return hasAnyPeran(userId, ["tutor"], { allowAdmin: false });
  },
  async dashboard(userId): Promise<TutorDashboard> {
    const day = getJakartaCalendarDate();
    const schedule = await getTutorDashboardReadModel(userId, day, getCalendarWeekRange(day), undefined, listTutorAccessibleCourses);
    const courses = schedule.assignedActiveCourses.map(({ courseId, code, title, legacyCourseId }) => ({
      courseId, code, title, legacyCourseId,
      groupCount: schedule.eligibleGroups.filter(group =>
        group.matchedCourseIds.includes(courseId) || (legacyCourseId && group.matchedCourseIds.includes(legacyCourseId))).length,
    }));
    return { courses, counts: { courses: courses.length, activeGroups: schedule.eligibleGroups.length,
      sessionsThisWeek: schedule.sessionsThisWeek, pendingTickets: schedule.pendingTicketCount },
      upcomingSessions: schedule.upcomingSessions, pendingTickets: schedule.pendingTickets };
  },
  async analytics(userId, courseId): Promise<TutorAnalytics | null> {
    const result = await getTutorCourseOverview(userId, courseId);
    if (!result) return null;
    const { courseTitle, enrolledCount, activeCount, weakConcepts, allConcepts, interventionCounts } = result.analytics;
    return { courseTitle, enrolledCount, activeCount, weakConcepts, allConcepts, interventionCounts };
  },
  async participants(userId, courseId): Promise<TutorParticipants> {
    const { course, participants, groups } = await getTutorCourseParticipants(userId, courseId, { allowAdmin: false }, undefined, requireTutorCourseAccess);
    return {
      course: { courseId: course.id, code: course.code, title: course.title, legacyCourseId: course.legacyCourseId, groupCount: groups.length },
      participants: participants.map(({ userId, name, email, enrollmentType, enrolledAt, expiresAt, groups }) => ({
        userId, name, email, enrollmentType, enrolledAt: enrolledAt?.toISOString() ?? null,
        expiresAt: expiresAt?.toISOString() ?? null, groups: groups.map(({ id, name, role }) => ({ id, name, role })),
      })),
      groups: groups.map(({ id, name, packageName, totalQuotaSessions, usedQuotaSessions, membersCount, members }) => ({
        id, name, packageName, totalQuotaSessions, usedQuotaSessions, membersCount,
        members: members.map(({ userId, name, email, role }) => ({ userId, name, email, role })),
      })),
    };
  },
  async grading(userId, courseId): Promise<TutorGrading> {
    const { courseTitle, access, submissionsList } = await readAuthorizedTryoutGrading(userId, courseId, false);
    return { course: { courseId: access.courseId ?? courseId, legacyCourseId: access.legacyCourseId,
      title: courseTitle, code: null, groupCount: 0 },
      submissions: submissionsList.map(row => ({ id: row.id, examTitle: row.examTitle, studentName: row.studentName,
        studentEmail: row.studentEmail, status: row.status, score: row.score, teacherNotes: row.teacherNotes,
        ...projectTryoutSnapshots(row.questionsSnapshot, row.answersSnapshot), submittedAt: row.submittedAt?.toISOString() ?? null })) };
  },
  async courses(): Promise<AdminCourse[]> {
    return (await getCoursesWithStats()).map(({ id, title, category, description, chapterCount, materialCount, quizCount }) => ({
      id, slug: id, title, category, description, chapterCount, materialCount, quizCount,
    }));
  },
  async course(slug): Promise<AdminCourseOverview | null> {
    const detail = await getCourseDetailData(slug);
    if (!detail) return null;
    const { id, title, category, description } = detail.course;
    const materialCounts = new Map<string, number>();
    for (const material of detail.materials) {
      for (const chapterId of new Set(materialChapterIds(material.chapterIds))) {
        materialCounts.set(chapterId, (materialCounts.get(chapterId) ?? 0) + 1);
      }
    }
    return {
      course: { id, slug, title, category, description, chapterCount: detail.stats.totalChapters,
        materialCount: detail.stats.totalMaterials, quizCount: detail.stats.totalQuizzes },
      chapters: detail.chapters.map(({ id, title, description, orderIndex }) => ({
        id, title, description, orderIndex, materialCount: materialCounts.get(id) ?? 0,
        // The web chapter overview uses the same detail read with includeQuestions=false.
        questionCount: 0,
      })),
    };
  },
} satisfies AcademicReadServices;
