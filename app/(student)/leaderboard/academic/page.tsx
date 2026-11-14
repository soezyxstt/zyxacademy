import { StudentLeaderboardView } from "@/components/student-leaderboard-view";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createMetadata} from "@/lib/site";
import { getCourseLeaderboard } from "@/lib/course-utils";
import { listStudentCourses, listStudentEnrollments } from "@/lib/student/course-catalog";
import { getTranslations } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("student");
  return createMetadata({ title: t("leaderboard.title"), description: t("leaderboard.metadataDescription"), path: "/leaderboard" });
}


export default async function LeaderboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/sign-in");

  const allCourses = process.env.NODE_ENV === "development" && session.user.role === "admin"
    ? await listStudentCourses()
    : await listStudentEnrollments(session.user.id);

  // Per-course leaderboard: top 10 per course, loaded in parallel with defensive error boundary
  const leaderboardEntries = await Promise.all(
    allCourses.map(async (course) => {
      try {
        const ranked = await getCourseLeaderboard(course.id);
        return {
          courseId: course.id,
          rows: ranked.slice(0, 10).map((r) => ({
            rank: r.rank,
            name: r.studentName,
            avgScore: r.avgScore,
            attempts: r.attemptCount,
          })),
        };
      } catch (err) {
        console.error(`Gagal memuat papan peringkat kelas ${course.id}:`, err);
        return {
          courseId: course.id,
          rows: [],
        };
      }
    })
  );

  const leaderboardByCourse: Record<
    string,
    { rank: number; name: string; avgScore: number; attempts: number }[]
  > = Object.fromEntries(leaderboardEntries.map((e) => [e.courseId, e.rows]));

  return <StudentLeaderboardView allCourses={allCourses} leaderboardByCourse={leaderboardByCourse} />;
}
