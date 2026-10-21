import type { Metadata } from "next";
import Link from "next/link";
import { Lock, Trophy } from "lucide-react";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { studentCardClass } from "@/components/course/course-surfaces";
import { createMetadata, pageTitle } from "@/lib/site";
import { getCourse, getCourseLeaderboard } from "@/lib/course-utils";
import { getAuthSession } from "@/lib/auth-session";
import { checkEnrollment } from "@/app/(student)/dashboard/actions";
import { EnrollmentForm } from "@/components/enrollment-form";
import { Reveal } from "@/components/ui/reveal";
import { tabListClassName, tabTriggerClassName, tabTriggerActiveClassName } from "@/components/ui/tabs";
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
  const session = await getAuthSession();
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

  const simTabLabel = id === PKA_COURSE_ID ? "Simulasi" : "Tryout";

  return (
    <CoursePageShell
      title={`Peringkat Kelas: ${course.title}`}

      icon={Trophy}
    >
      <Reveal>
        <nav aria-label="Jenis peringkat" className="mb-4">
          <div className={tabListClassName}>
            <Link href={`/courses/${id}/leaderboard?type=quiz`} aria-current={activeType === "quiz" ? "page" : undefined} className={cn(tabTriggerClassName, activeType === "quiz" && tabTriggerActiveClassName)}>Kuis</Link>
            <Link href={`/courses/${id}/leaderboard?type=simulation`} aria-current={activeType === "simulation" ? "page" : undefined} className={cn(tabTriggerClassName, activeType === "simulation" && tabTriggerActiveClassName)}>{simTabLabel}</Link>
          </div>
        </nav>

        {/* User's own ranking status card */}
        <div className="mb-4 rounded-xl border border-border/70 bg-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-heading text-body-base font-bold text-foreground">
              Peringkat Anda
            </h3>
            <p className="text-body-sm text-muted-foreground mt-1">
              Berdasarkan rata-rata skor {activeType === "simulation" ? "tryout" : "kuis"} dan kriteria tie-breaker.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Trophy className="size-5 text-brand-secondary" />
            <div className="text-body-base font-semibold text-foreground">
              {myEntry ? (
                <>
                  <span className="text-brand-primary font-bold text-body-base">{myEntry.rank}</span> dari <span className="font-bold">{totalStudents}</span>
                </>
              ) : (
                <>
                  <span className="text-muted-foreground font-bold">-</span> dari <span className="font-bold">{totalStudents}</span> <span className="text-body-xs text-muted-foreground block">(Belum ada skor {activeType === "simulation" ? "tryout" : "kuis"})</span>
                </>
              )}
            </div>
          </div>
        </div>

        {rankedRows.length === 0 ? (
          <div className="py-8 text-center max-w-md mx-auto bg-card p-4 border border-border rounded-xl">
            <Trophy className="size-10 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="font-heading text-body-base font-bold text-foreground mb-1">
              Belum ada peringkat {activeType === "simulation" ? "try out" : "kuis"}
            </h3>
            <p className="text-body-sm text-muted-foreground">
              {activeType === "simulation"
                ? "Selesaikan tryout untuk masuk peringkat."
                : "Selesaikan kuis untuk masuk peringkat."}
            </p>
          </div>
        ) : (
          <section aria-label="Tiga peringkat teratas" className="overflow-hidden rounded-xl border border-border/70 bg-card">
            <h2 className="border-b border-border/60 px-4 py-3 font-heading text-body-base font-bold">3 teratas</h2>
            <ol className="divide-y divide-border/60">
              {top3.map((entry) => (
                <li key={entry.studentId} className="flex items-start gap-3 px-4 py-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-body-sm font-semibold">{entry.rank}</span>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-body-sm font-semibold">{entry.studentName}</p>
                    <p className="mt-1 text-body-xs text-muted-foreground">
                      {entry.attemptCount} {activeType === "simulation" ? "tryout" : "kuis"} · {formatDuration(entry.avgDuration)}
                    </p>
                    <p className="mt-0.5 text-body-xs text-muted-foreground">{entry.correctHardCount} soal sulit benar · {entry.attemptedMediumCount} soal sedang dikerjakan</p>
                  </div>
                  <span className="shrink-0 text-body-base font-bold text-brand-primary">{entry.avgScore}%</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </Reveal>
    </CoursePageShell>
  );
}
