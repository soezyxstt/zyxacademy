import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { interventions, submissions, weeklyReflections } from "@/db/schema";
import { loadAvailableAssessmentsData, loadReviewQueueData } from "@/app/(student)/dashboard/dashboard-sections";
import { getStudentGamificationAccess } from "@/lib/gamification/access";
import { MICRO } from "@/lib/gamification/catalog";
import { rankLabels } from "@/lib/gamification/labels";
import { getGamificationSummary } from "@/lib/gamification/queries";
import { getMastery } from "@/lib/mastery-store";
import { getOrBuildTodayRecommendation } from "@/lib/recommendation-service";
import { getOrUpdateStreak } from "@/lib/streak-service";
import { getDashboardCourseExamsBatch } from "@/lib/student/dashboard-read-model";
import type { StudentEnrollmentRecord } from "@/lib/student/course-catalog";
import { coursePath, type DashboardExtrasData } from "@/packages/native-parity/student/courses/contract";

function isCurrentCoursePath(href: unknown, courseIds: string[]): href is string {
  if (typeof href !== "string" || !href.startsWith("/courses/") || /[\\\u0000-\u001f]/u.test(href)) return false;
  const path = new URL(href, "https://student.invalid").pathname;
  return courseIds.some((id) => path === coursePath(id) || path.startsWith(`${coursePath(id)}/`));
}

async function loadToday(studentId: string, ids: string[]): Promise<DashboardExtrasData["today"]> {
  const [streak, recommendation] = await Promise.all([
    getOrUpdateStreak(studentId), getOrBuildTodayRecommendation(studentId, ids),
  ]);
  const items = recommendation.items
    .filter(({ href }) => isCurrentCoursePath(href, ids))
    .map(({ id, kind, title, count, done, href }) => ({ id, kind, title, count, done, href }));
  return { streak: streak.current, items };
}

async function loadIntervention(studentId: string, ids: string[]): Promise<DashboardExtrasData["intervention"]> {
  const [active] = await db.select({
    id: interventions.id, courseId: interventions.courseId, concept: interventions.conceptName, reason: interventions.reason, payload: interventions.payload,
  }).from(interventions).where(and(eq(interventions.studentId, studentId), eq(interventions.status, "active"), inArray(interventions.courseId, ids)))
    .orderBy(desc(interventions.createdAt)).limit(1);

  if (!active) return undefined;
  const { id, courseId, concept, reason, payload } = active;
  const details = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const course = coursePath(courseId);
  const quizId = Array.isArray(details.quizTemplateIds) && typeof details.quizTemplateIds[0] === "string" ? details.quizTemplateIds[0] : null;
  return {
    id, courseId, concept, reason,
    materialHref: isCurrentCoursePath(details.moduleHref, [courseId]) ? details.moduleHref : course,
    quizHref: quizId ? `${course}/quiz/${encodeURIComponent(quizId)}` : `${course}/quiz`,
    flashcards: typeof details.flashcardCount === "number" && Number.isFinite(details.flashcardCount) ? details.flashcardCount : null,
  };
}

async function loadAchievements(studentId: string): Promise<DashboardExtrasData["achievements"]> {
  const access = await getStudentGamificationAccess();
  if (access?.user.id !== studentId) return undefined;
  const summary = await getGamificationSummary(studentId);
  return {
    rank: rankLabels[summary.rankKey] ?? rankLabels.rakyat,
    xp: (summary.baseXpMicro + summary.bonusXpMicro) / MICRO,
    lp: summary.lpBalance,
  };
}

async function loadReflection(studentId: string): Promise<DashboardExtrasData["reflection"]> {
  const [row] = await db.select({ weekStart: weeklyReflections.weekStart, payload: weeklyReflections.payload })
    .from(weeklyReflections).where(eq(weeklyReflections.studentId, studentId)).orderBy(desc(weeklyReflections.weekStart)).limit(1);
  const payload = row?.payload;
  if (!payload?.completed) return undefined;
  return { weekStart: row.weekStart, ...payload.completed, masteryGrowth: payload.masteryGrowth, mostImproved: payload.mostImproved };
}

async function loadMastery(studentId: string, course: StudentEnrollmentRecord): Promise<DashboardExtrasData["mastery"]> {
  const concepts = await getMastery(studentId, course.id);
  return {
    courseId: course.id, title: course.title,
    concepts: concepts.slice(0, 4).map((concept) => ({ name: concept.conceptName, score: Math.round(concept.masteryScore), measured: concept.isMeasured ?? concept.evidenceCount > 0 })),
  };
}

async function loadReviews(studentId: string, courses: StudentEnrollmentRecord[]): Promise<DashboardExtrasData["reviews"]> {
  const review = await loadReviewQueueData(studentId, courses);
  const courseTitle = courses.find(({ id }) => id === review.firstCourseWithQueue)?.title;
  const activeTitles = new Set(courses.map(course => course.title));
  return {
    due: review.totalDueFlashcards,
    courseId: review.firstCourseWithQueue,
    courseTitle,
    recent: review.recentReviews.filter(({ courseTitle }) => activeTitles.has(courseTitle))
      .map(({ id, front, courseTitle, grade, reviewedAt }) => ({ id, front, courseTitle, grade, reviewedAt: reviewedAt.toISOString() })),
  };
}

async function loadAssessments(studentId: string, courses: StudentEnrollmentRecord[]): Promise<DashboardExtrasData["assessments"]> {
  const exams = await loadAvailableAssessmentsData(courses, {
    getDashboardStudentSubmissionSummaries: () => db.select({ examId: submissions.examId, status: submissions.status })
      .from(submissions).where(eq(submissions.userId, studentId)),
    getDashboardCourseExamsBatch: (ids) => getDashboardCourseExamsBatch(ids, studentId),
  });
  return {
    total: exams.length,
    items: exams.slice(0, 4).map(({ id, courseId, courseTitle, title, type }) => ({ id, courseId, courseTitle, title, type })),
  };
}

/** Keep slow or unavailable supplemental reads independent of the dashboard's primary learning data. */
export async function loadNativeDashboardExtras(studentId: string, courses: StudentEnrollmentRecord[]): Promise<DashboardExtrasData> {
  if (!courses.length) return { view: "dashboard-extras" };
  const ids = courses.map(course => course.id);
  const settled = await Promise.allSettled([
    loadToday(studentId, ids),
    loadIntervention(studentId, ids),
    loadAchievements(studentId),
    loadReflection(studentId),
    loadMastery(studentId, courses[0]),
    loadReviews(studentId, courses),
    loadAssessments(studentId, courses),
  ] as const);
  function fulfilled<T>(result: PromiseSettledResult<T>): T | undefined {
    return result.status === "fulfilled" ? result.value : undefined;
  }
  const [today, intervention, achievements, reflection, mastery, reviews, assessments] = settled;
  return {
    view: "dashboard-extras",
    today: fulfilled(today),
    intervention: fulfilled(intervention),
    achievements: fulfilled(achievements),
    reflection: fulfilled(reflection),
    mastery: fulfilled(mastery),
    reviews: fulfilled(reviews),
    assessments: fulfilled(assessments),
    partial: settled.some(result => result.status === "rejected"),
  };
}
