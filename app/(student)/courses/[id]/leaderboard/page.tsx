import type { Metadata } from "next";
import Link from "next/link";
import { Lock, Trophy } from "lucide-react";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { studentCardClass } from "@/components/course/course-surfaces";
import { createMetadata, pageTitle } from "@/lib/site";
import { getCourse, getCourseLeaderboard } from "@/lib/course-utils";
import { checkEnrollment } from "@/app/(student)/dashboard/actions";
import { EnrollmentForm } from "@/components/enrollment-form";
import { Reveal } from "@/components/ui/reveal";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { PKA_COURSE_ID } from "@/lib/pka-config";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const course = await getCourse(id);
  return createMetadata({
    title: course ? `Papan Peringkat ${course.title}` : "Papan Peringkat",
    description: `Peringkat kelas ${course?.title ?? ""} berdasarkan capaian kuis dan tryout.`,
    path: `/courses/${id}/leaderboard`,
  });
}


function formatDuration(seconds: number) {
  if (!seconds || seconds <= 0) return "0s";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

export default async function CourseLeaderboardPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { type } = await searchParams;
  const activeType = type === "simulation" ? "simulation" : "quiz";

  const course = await getCourse(id);
  if (!course) return null;

  const isEnrolled = await checkEnrollment(id);

  if (!isEnrolled) {
    return (
      <CoursePageShell
        title={`Peringkat Kelas: ${course.title}`}
        description="Lihat peringkat Anda dan teman sekelas berdasarkan rata-rata nilai."
        icon={Trophy}
      >
        <Reveal>
          <div className={studentCardClass()}>
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border">
                <Lock className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-heading text-body-base font-bold text-foreground">Butuh token kelas</h3>
                <p className="mt-1 text-body-sm text-muted-foreground">
                  Aktifkan kelas untuk melihat peringkat dan skor gabungan.
                </p>
              </div>
            </div>
            <div className="mt-4">
              <EnrollmentForm />
            </div>
          </div>
        </Reveal>
      </CoursePageShell>
    );
  }

  // Get session to find current user's rank
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;

  let rankedRows: Awaited<ReturnType<typeof getCourseLeaderboard>> = [];
  try {
    rankedRows = await getCourseLeaderboard(id, activeType);
  } catch (err) {
    console.error("Error fetching course leaderboard:", err);
    rankedRows = [];
  }
  const totalStudents = rankedRows.length;
  const myEntry = rankedRows.find((r) => r.studentId === userId);

  const top3 = rankedRows.slice(0, 3);
  const p1 = top3.find((r) => r.rank === 1);
  const p2 = top3.find((r) => r.rank === 2);
  const p3 = top3.find((r) => r.rank === 3);

  const simTabLabel = id === PKA_COURSE_ID ? "Leaderboard Simulasi" : "Leaderboard Try Out";

  return (
    <CoursePageShell
      title={`Peringkat Kelas: ${course.title}`}
      description="Lihat peringkat Anda dan teman sekelas berdasarkan rata-rata nilai."
      icon={Trophy}
    >
      <Reveal>
        {/* Navigation Tabs for Leaderboards */}
        <div className="mb-6 flex items-center gap-2 border-b border-border pb-3">
          <Link
            href={`/courses/${id}/leaderboard?type=quiz`}
            className={cn(
              "rounded-md px-4 py-2 text-body-sm font-semibold transition-colors",
              activeType === "quiz"
                ? "bg-brand-primary text-white shadow-xs"
                : "bg-muted text-muted-foreground hover:bg-border hover:text-foreground"
            )}
          >
            Leaderboard Kuis
          </Link>
          <Link
            href={`/courses/${id}/leaderboard?type=simulation`}
            className={cn(
              "rounded-md px-4 py-2 text-body-sm font-semibold transition-colors",
              activeType === "simulation"
                ? "bg-brand-primary text-white shadow-xs"
                : "bg-muted text-muted-foreground hover:bg-border hover:text-foreground"
            )}
          >
            {simTabLabel}
          </Link>
        </div>

        {/* User's own ranking status card */}
        <div className="mb-8 p-6 rounded-2xl border border-border/70 bg-card/75 backdrop-blur-md shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-heading text-body-base font-bold text-foreground">
              Status Peringkat Anda
            </h3>
            <p className="text-body-sm text-muted-foreground mt-1">
              Peringkat dihitung berdasarkan rata-rata skor {activeType === "simulation" ? "tryout" : "kuis"} dan kriteria tie-breaker.
            </p>
          </div>
          <div className="flex items-center gap-3 bg-muted/50 px-5 py-3 rounded-xl border border-border/50 shrink-0">
            <Trophy className="size-5 text-brand-secondary" />
            <div className="text-body-base font-semibold text-foreground">
              {myEntry ? (
                <>
                  Peringkat Anda: <span className="text-brand-primary font-bold text-body-base">{myEntry.rank}</span> dari <span className="font-bold">{totalStudents}</span>
                </>
              ) : (
                <>
                  Peringkat Anda: <span className="text-muted-foreground font-bold">-</span> dari <span className="font-bold">{totalStudents}</span> <span className="text-body-xs text-muted-foreground block">(Belum ada skor {activeType === "simulation" ? "tryout" : "kuis"})</span>
                </>
              )}
            </div>
          </div>
        </div>

        {rankedRows.length === 0 ? (
          <div className="py-16 text-center max-w-md mx-auto bg-card/50 p-8 shadow-xs border border-border rounded-xl">
            <Trophy className="size-10 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="font-heading text-body-base font-bold text-foreground mb-1">
              Belum ada peringkat {activeType === "simulation" ? "try out" : "kuis"}
            </h3>
            <p className="text-body-sm text-muted-foreground">
              {activeType === "simulation"
                ? "Simulasi ujian UTS dan UAS belum selesai dikerjakan. Selesaikan try out pertama untuk memuncaki peringkat."
                : "Belum ada skor kuis untuk kelas ini. Selesaikan kuis untuk muncul di papan peringkat."}
            </p>
          </div>
        ) : (
          <div className={studentCardClass("p-6 sm:p-8")}>
            <div className="text-center mb-8">
              <h2 className="font-heading text-body-base font-bold text-foreground">
                Podium Juara Kelas
              </h2>
              <p className="text-body-sm text-muted-foreground mt-1">
                Tiga siswa dengan performa terbaik berdasarkan kriteria tie-breaker.
              </p>
            </div>

            {/* Podium for top 3 */}
            <div className="grid grid-cols-3 gap-3 items-end mb-6 max-w-xl mx-auto pt-6">
              {/* Rank 2 */}
              <div className="flex flex-col items-center">
                {p2 ? (
                  <div className="w-full flex flex-col items-center">
                    <div className="relative flex flex-col items-center justify-end p-4 rounded-xl border border-border/70 bg-card/75 backdrop-blur-md shadow-2xs w-full text-center min-h-[190px] hover:border-brand-primary/40 transition-all">
                      <div className="absolute -top-5 flex size-9 items-center justify-center rounded-full bg-slate-200 border border-slate-300 dark:bg-slate-800 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-body-sm shadow-xs shrink-0">
                        2
                      </div>
                      <div className="font-heading text-body-xs font-bold text-foreground line-clamp-2 w-full px-1">
                        {p2.studentName}
                      </div>
                      <div className="text-h6 font-bold text-slate-600 dark:text-slate-400 mt-1">
                        {p2.avgScore}%
                      </div>
                      <div className="text-body-xs text-muted-foreground mt-2 space-y-0.5 border-t border-border/50 pt-2 w-full">
                        <div>{p2.attemptCount} {activeType === "simulation" ? "tryout" : "kuis"}</div>
                        <div className="text-[10px]">⏱️ {formatDuration(p2.avgDuration)}</div>
                        <div className="text-[10px]">🔥 {p2.correctHardCount} Soal Sulit</div>
                        <div className="text-[10px]">📚 {p2.attemptedMediumCount} Soal Sedang</div>
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
                    <div className="relative flex flex-col items-center justify-end p-5 rounded-2xl border-2 border-brand-secondary/40 bg-card/75 backdrop-blur-md shadow-md w-full text-center min-h-[220px] hover:border-brand-secondary transition-all">
                      <div className="absolute -top-7 flex size-11 items-center justify-center rounded-full bg-brand-secondary border-2 border-amber-300 text-white font-bold text-body-base shadow-md shrink-0">
                        🥇
                      </div>
                      <div className="font-heading text-body-sm font-extrabold text-foreground line-clamp-2 w-full px-1">
                        {p1.studentName}
                      </div>
                      <div className="text-h6 font-extrabold text-brand-secondary mt-1">
                        {p1.avgScore}%
                      </div>
                      <div className="text-body-xs text-muted-foreground font-medium mt-2 space-y-0.5 border-t border-border/50 pt-2 w-full">
                        <div className="font-semibold text-foreground/80">{p1.attemptCount} {activeType === "simulation" ? "tryout" : "kuis"}</div>
                        <div className="text-[10px]">⏱️ {formatDuration(p1.avgDuration)}</div>
                        <div className="text-[10px]">🔥 {p1.correctHardCount} Soal Sulit</div>
                        <div className="text-[10px]">📚 {p1.attemptedMediumCount} Soal Sedang</div>
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
                    <div className="relative flex flex-col items-center justify-end p-4 rounded-xl border border-border/70 bg-card/75 backdrop-blur-md shadow-2xs w-full text-center min-h-[175px] hover:border-brand-primary/40 transition-all">
                      <div className="absolute -top-5 flex size-9 items-center justify-center rounded-full bg-amber-700/10 border border-amber-700/20 text-amber-800 dark:bg-amber-900/20 dark:border-amber-900/30 dark:text-amber-400 font-bold text-body-sm shadow-xs shrink-0">
                        3
                      </div>
                      <div className="font-heading text-body-xs font-bold text-foreground line-clamp-2 w-full px-1">
                        {p3.studentName}
                      </div>
                      <div className="text-h6 font-bold text-amber-700 dark:text-amber-500 mt-1">
                        {p3.avgScore}%
                      </div>
                      <div className="text-body-xs text-muted-foreground mt-2 space-y-0.5 border-t border-border/50 pt-2 w-full">
                        <div>{p3.attemptCount} {activeType === "simulation" ? "tryout" : "kuis"}</div>
                        <div className="text-[10px]">⏱️ {formatDuration(p3.avgDuration)}</div>
                        <div className="text-[10px]">🔥 {p3.correctHardCount} Soal Sulit</div>
                        <div className="text-[10px]">📚 {p3.attemptedMediumCount} Soal Sedang</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-10 w-full" />
                )}
              </div>
            </div>
          </div>
        )}
      </Reveal>
    </CoursePageShell>
  );
}
