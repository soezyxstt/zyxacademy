import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Trophy, ChevronRight } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  studentQuizAttempts,
  quizTemplates,
  enrollments,
  courses,
  user,
} from "@/db/schema";
import { and, eq, sql, gt, inArray } from "drizzle-orm";
import { pageTitle } from "@/lib/site";
import { Reveal } from "@/components/ui/reveal";
import { PageHeader } from "@/components/page-header";
import { studentCardClass } from "@/components/course/course-surfaces";


export const metadata: Metadata = {
  title: pageTitle("Papan Peringkat"),
  description: "Peringkat kuis per kursus.",
};

export default async function LeaderboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/sign-in");

  const now = new Date();

  // Get all courses the student is enrolled in
  let enrolled;
  if (process.env.NODE_ENV === "development" && session.user.role === "admin") {
    const all = await db.select({ courseId: courses.id }).from(courses);
    enrolled = all;
  } else {
    enrolled = await db
      .select({ courseId: enrollments.courseId })
      .from(enrollments)
      .where(and(eq(enrollments.userId, session.user.id), gt(enrollments.expiresAt, now)));
  }

  const courseIds = enrolled.map((e) => e.courseId);

  // Get course titles
  const allCourses =
    courseIds.length > 0
      ? await db
          .select({ id: courses.id, title: courses.title })
          .from(courses)
          .where(inArray(courses.id, courseIds))
      : [];

  // Per-course leaderboard: top 10 per course
  const leaderboardByCourse: Record<
    string,
    { rank: number; name: string; avgScore: number; attempts: number }[]
  > = {};

  for (const course of allCourses) {
    const rows = await db
      .select({
        studentName: user.name,
        avgScore: sql<number>`round(avg(${studentQuizAttempts.score}), 1)`,
        attempts: sql<number>`count(*)`,
      })
      .from(studentQuizAttempts)
      .innerJoin(quizTemplates, eq(studentQuizAttempts.templateId, quizTemplates.id))
      .innerJoin(user, eq(studentQuizAttempts.studentId, user.id))
      .where(
        and(
          eq(quizTemplates.courseId, course.id),
          eq(studentQuizAttempts.status, "completed"),
        ),
      )
      .groupBy(user.name)
      .orderBy(sql`avg(${studentQuizAttempts.score}) DESC`)
      .limit(10);

    leaderboardByCourse[course.id] = rows.map((r, i) => ({
      rank: i + 1,
      name: r.studentName,
      avgScore: Number(r.avgScore),
      attempts: r.attempts,
    }));
  }

  return (
    <Reveal className="marketing-container mx-auto w-full px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Papan Peringkat"
        description="Peringkat kuis berdasarkan rata-rata skor tiap kelas bimbingan."
        icon={Trophy}
      />

      {allCourses.length === 0 ? (
        <div className={studentCardClass("py-16 text-center max-w-md mx-auto bg-card/50 p-8 shadow-xs")}>
          <Trophy className="size-10 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-body-sm text-muted-foreground">
            Kamu belum terdaftar di kelas manapun.{" "}
            <Link href="/courses" className="text-brand-primary hover:underline font-semibold">
              Jelajahi kelas
            </Link>{" "}
            untuk memulai perjalanan belajarmu.
          </p>
        </div>
      ) : (
        <div className="space-y-12">
          {allCourses.map((course) => {
            const rows = leaderboardByCourse[course.id] ?? [];
            const p1 = rows.find((r) => r.rank === 1);
            const p2 = rows.find((r) => r.rank === 2);
            const p3 = rows.find((r) => r.rank === 3);
            const others = rows.filter((r) => r.rank > 3);

            return (
              <section key={course.id} className={studentCardClass("bg-card/45")}>
                <div className="mb-6 flex items-center justify-between">
                  <h2 className="font-heading text-h5 font-bold text-foreground">
                    {course.title}
                  </h2>
                  <Link
                    href={`/courses/${course.id}/leaderboard`}
                    className="flex items-center gap-1 text-body-xs font-semibold text-brand-primary hover:underline"
                  >
                    Lihat semua
                    <ChevronRight className="size-3.5" />
                  </Link>
                </div>

                {rows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center rounded-xl border border-dashed border-border bg-muted/10">
                    <Trophy className="size-8 text-muted-foreground/25 mb-2" />
                    <p className="text-body-sm text-muted-foreground">Belum ada kuis yang diselesaikan untuk kelas ini.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Podium for top 3 */}
                    <div className="grid grid-cols-3 gap-3 items-end mb-6 max-w-xl mx-auto pt-6">
                      {/* Rank 2 */}
                      <div className="flex flex-col items-center">
                        {p2 ? (
                          <div className="w-full flex flex-col items-center">
                            <div className="relative flex flex-col items-center justify-end p-4 rounded-xl border border-border bg-card shadow-2xs w-full text-center min-h-[140px] hover:border-brand-primary/20 transition-all">
                              <div className="absolute -top-5 flex size-9 items-center justify-center rounded-full bg-slate-200 border border-slate-300 dark:bg-slate-800 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-body-sm shadow-xs shrink-0">
                                2
                              </div>
                              <div className="font-heading text-body-xs font-bold text-foreground line-clamp-1 w-full px-1">
                                {p2.name}
                              </div>
                              <div className="text-body-md font-bold text-slate-600 dark:text-slate-400 mt-1">
                                {p2.avgScore}%
                              </div>
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                {p2.attempts} kuis
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="h-10 w-full" />
                        )}
                      </div>

                      {/* Rank 1 */}
                      <div className="flex flex-col items-center relative -top-3">
                        {p1 ? (
                          <div className="w-full flex flex-col items-center">
                            <div className="relative flex flex-col items-center justify-end p-5 rounded-2xl border-2 border-brand-secondary/40 bg-card shadow-md w-full text-center min-h-[170px] hover:border-brand-secondary transition-all">
                              <div className="absolute -top-7 flex size-11 items-center justify-center rounded-full bg-brand-secondary border-2 border-amber-300 text-white font-bold text-body-md shadow-md shrink-0">
                                🥇
                              </div>
                              <div className="font-heading text-body-sm font-extrabold text-foreground line-clamp-1 w-full px-1">
                                {p1.name}
                              </div>
                              <div className="text-h6 font-extrabold text-brand-secondary mt-1">
                                {p1.avgScore}%
                              </div>
                              <div className="text-[10px] text-muted-foreground font-medium mt-0.5">
                                {p1.attempts} kuis
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="h-10 w-full" />
                        )}
                      </div>

                      {/* Rank 3 */}
                      <div className="flex flex-col items-center">
                        {p3 ? (
                          <div className="w-full flex flex-col items-center">
                            <div className="relative flex flex-col items-center justify-end p-4 rounded-xl border border-border bg-card shadow-2xs w-full text-center min-h-[125px] hover:border-brand-primary/20 transition-all">
                              <div className="absolute -top-5 flex size-9 items-center justify-center rounded-full bg-amber-700/10 border border-amber-700/20 text-amber-800 dark:bg-amber-900/20 dark:border-amber-900/30 dark:text-amber-400 font-bold text-body-sm shadow-xs shrink-0">
                                3
                              </div>
                              <div className="font-heading text-body-xs font-bold text-foreground line-clamp-1 w-full px-1">
                                {p3.name}
                              </div>
                              <div className="text-body-md font-bold text-amber-700 dark:text-amber-500 mt-1">
                                {p3.avgScore}%
                              </div>
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                {p3.attempts} kuis
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="h-10 w-full" />
                        )}
                      </div>
                    </div>

                    {/* Table for other ranks */}
                    {others.length > 0 && (
                      <div className="overflow-hidden rounded-xl border border-border bg-card/60 shadow-xs">
                        <table className="w-full text-left text-body-sm">
                          <thead>
                            <tr className="border-b border-border bg-muted/20">
                              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground w-14">
                                #
                              </th>
                              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Nama
                              </th>
                              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">
                                Rata-rata
                              </th>
                              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">
                                Kuis
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {others.map((r) => (
                              <tr
                                key={r.name}
                                className="border-b border-border/40 hover:bg-muted/10 last:border-0 transition-colors"
                              >
                                <td className="px-4 py-3 tabular-nums font-semibold text-muted-foreground">
                                  {r.rank}
                                </td>
                                <td className="px-4 py-3 font-medium text-foreground">{r.name}</td>
                                <td className="px-4 py-3 tabular-nums font-semibold text-brand-primary text-right">
                                  {r.avgScore}%
                                </td>
                                <td className="px-4 py-3 tabular-nums text-muted-foreground text-right">
                                  {r.attempts}×
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </Reveal>
  );
}
