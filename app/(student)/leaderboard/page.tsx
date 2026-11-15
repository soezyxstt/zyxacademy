import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AdminEmptyState as AccessErrorState } from "@/components/admin/state-panels";
import { LeaderboardList } from "@/components/gamification/leaderboard-list";
import { StudentAcademicLeaderboardView } from "@/components/student-academic-leaderboard-view";
import { StudentLeaderboardControls } from "@/components/student-leaderboard-controls";
import { StudentLeaderboardView } from "@/components/student-leaderboard-view";
import { auth } from "@/lib/auth";
import { getCourseLeaderboard } from "@/lib/course-utils";
import { requireStudentGamificationAccess } from "@/lib/gamification/access";
import { getVisibleStudentIdentities } from "@/lib/gamification/social";
import { getTranslations, getAppLocale } from "@/lib/i18n/server";
import { createMetadata } from "@/lib/site";
import { listStudentCourses, listStudentEnrollments } from "@/lib/student/course-catalog";

type LeaderboardQuery = { tab?: string; period?: string; scope?: string; cursor?: string; course?: string };

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations("student"), getAppLocale()]);
  return createMetadata({ title: t("leaderboard.title"), description: locale === "en" ? "Participation and course rankings in Zyx Academy." : "Peringkat partisipasi dan kelas di Zyx Academy.", path: "/leaderboard" });
}

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<LeaderboardQuery> }) {
  const [query, locale, t] = await Promise.all([searchParams, getAppLocale(), getTranslations("student")]);
  const tab = query.tab === "academic" ? "academic" : "rank";
  const period = query.period === "week" || query.period === "month" ? query.period : "all";
  const scope = query.scope === "following" ? "following" : "global";
  let courses: { id: string; title: string }[] = [];
  let courseId: string | undefined;
  let content;

  if (tab === "academic") {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) redirect("/sign-in?next=%2Fleaderboard%3Ftab%3Dacademic");
    courses = process.env.NODE_ENV === "development" && session.user.role === "admin"
      ? await listStudentCourses()
      : await listStudentEnrollments(session.user.id);
    courseId = courses.some((course) => course.id === query.course) ? query.course : undefined;
    const visibleCourses = courseId ? courses.filter((course) => course.id === courseId) : courses;
    const leaderboardEntries = await Promise.all(visibleCourses.map(async (course) => {
      try {
        const ranked = await getCourseLeaderboard(course.id);
        return [course.id, ranked.slice(0, 10).map((row) => ({
          studentId: row.studentId,
          rank: row.rank,
          name: row.studentName,
          avgScore: row.avgScore,
          attempts: row.attemptCount,
        }))] as const;
      } catch (error) {
        console.error(`Gagal memuat papan peringkat kelas ${course.id}:`, error);
        return [course.id, []] as const;
      }
    }));
    // Academic access is independent of gamification access. Identity enrichment is optional.
    const studentIds = leaderboardEntries.flatMap(([, rows]) => rows.map((row) => row.studentId));
    const identities = studentIds.length
      ? await getVisibleStudentIdentities(session.user.id, studentIds).catch(() => new Map())
      : new Map();
    const leaderboardByCourse = Object.fromEntries(leaderboardEntries.map(([id, rows]) => [id, rows.map(({ studentId, ...row }) => ({
      ...row,
      identity: identities.get(studentId) ?? null,
    }))]));
    content = <StudentAcademicLeaderboardView embedded allCourses={visibleCourses} leaderboardByCourse={leaderboardByCourse} />;
  } else {
    let userId: string | undefined;
    let accessError: "achievementPage.forbidden" | "achievementPage.unavailable" = "achievementPage.unavailable";
    try {
      const { user } = await requireStudentGamificationAccess();
      userId = user.id;
    } catch (error) {
      if (error instanceof Error && error.message === "Unauthorized") redirect("/sign-in?next=%2Fleaderboard");
      accessError = error instanceof Error && error.message === "Forbidden" ? "achievementPage.forbidden" : "achievementPage.unavailable";
    }
    content = userId ? <LeaderboardList userId={userId} query={query} locale={locale} /> : <AccessErrorState title={t(accessError)} />;
  }

  return (
    <StudentLeaderboardView title={locale === "en" ? "Leaderboard" : "Papan peringkat"}>
      <StudentLeaderboardControls tab={tab} period={period} scope={scope} courseId={courseId} courses={courses} locale={locale}>
        {content}
      </StudentLeaderboardControls>
    </StudentLeaderboardView>
  );
}
