import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, eq, gt, and, or, isNull } from "drizzle-orm";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  GraduationCap,
  ShieldAlert,
  Video,
  BellRing,
} from "lucide-react";
import { db } from "@/db";
import { pkaAnnouncements, pkaAnnouncementReads, pkaSchedules, quizTemplates, studentQuizAttempts } from "@/db/schema";
import { createMetadata, pageTitle } from "@/lib/site";
import {
  PKA_ASSUMED_TEST_DATE,
  PKA_DISCLAIMER,
  PKA_COURSE_ID,
  PKA_TOTAL_SESSIONS,
} from "@/lib/pka-config";
import { requirePkaSession } from "@/lib/pka-enrollment";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { PkaCountdown } from "@/components/pka/pka-countdown";
import { Reveal } from "@/components/ui/reveal";
import { FormattedDate } from "@/components/ui/formatted-date";
import { AnnouncementCard } from "./_components/announcement-card";

export const metadata: Metadata = createMetadata({
  title: "Tutorial PKA",
  description:
    "Persiapan Pemetaan Kesiapan Akademik (PKA) ITB: jadwal sesi live, simulasi kuis, dan materi Matematika, Fisika, Kimia.",
  path: "/courses/tutorial-pka",
});


export default async function PkaCourseHomePage() {
  const userId = await requirePkaSession("/courses/tutorial-pka");

  const now = new Date();
  const [simTemplates, studentAttempts, upcoming, announcements] = await Promise.all([
    db
      .select()
      .from(quizTemplates)
      .where(
        and(
          eq(quizTemplates.courseId, PKA_COURSE_ID),
          eq(quizTemplates.status, "published"),
          eq(quizTemplates.category, "simulation")
        )
      ),
    db
      .select({
        score: studentQuizAttempts.score,
        status: studentQuizAttempts.status,
      })
      .from(studentQuizAttempts)
      .innerJoin(quizTemplates, eq(studentQuizAttempts.templateId, quizTemplates.id))
      .where(
        and(
          eq(studentQuizAttempts.studentId, userId),
          eq(quizTemplates.courseId, PKA_COURSE_ID),
          eq(quizTemplates.category, "simulation")
        )
      ),
    db
      .select()
      .from(pkaSchedules)
      .where(gt(pkaSchedules.sessionAt, now))
      .orderBy(asc(pkaSchedules.sessionAt))
      .limit(1),
    db
      .select({
        id: pkaAnnouncements.id,
        title: pkaAnnouncements.title,
        body: pkaAnnouncements.body,
        createdAt: pkaAnnouncements.createdAt,
        isPinned: pkaAnnouncements.isPinned,
      })
      .from(pkaAnnouncements)
      .leftJoin(
        pkaAnnouncementReads,
        and(
          eq(pkaAnnouncements.id, pkaAnnouncementReads.announcementId),
          eq(pkaAnnouncementReads.userId, userId)
        )
      )
      .where(
        and(
          eq(pkaAnnouncements.isArchived, false),
          or(
            eq(pkaAnnouncements.isPinned, true),
            isNull(pkaAnnouncementReads.userId)
          )
        )
      )
      .orderBy(desc(pkaAnnouncements.isPinned), desc(pkaAnnouncements.createdAt)),
  ]);

  const nextSession = upcoming[0] ?? null;
  const completedAttempts = studentAttempts.filter((a) => a.status === "completed");
  const completedCount = completedAttempts.length;
  const bestScore = completedAttempts.length > 0
    ? Math.max(...completedAttempts.map((a) => a.score ?? 0))
    : 0;

  return (
    <CoursePageShell
      title="Tutorial PKA"
      description="Persiapan Pemetaan Kesiapan Akademik ITB: Matematika, Fisika, dan Kimia dalam satu kelas."
      icon={GraduationCap}
    >
      <div className="space-y-10">
        <Reveal>
          <PkaCountdown targetDate={PKA_ASSUMED_TEST_DATE.toISOString()} />
        </Reveal>

        {/* Announcements */}
        {announcements.length > 0 && (
          <Reveal>
            <section className="space-y-3">
              <div className="flex items-center gap-2 border-b border-border pb-2">
                <BellRing className="size-5 text-brand-primary" />
                <h2 className="font-heading text-body-base font-bold text-foreground">Pengumuman Terbaru</h2>
              </div>
              <div className="flex flex-col gap-4">
                {announcements.map((announcement) => (
                  <AnnouncementCard key={announcement.id} {...announcement} />
                ))}
              </div>
            </section>
          </Reveal>
        )}

        {/* Next session */}
        <Reveal>
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-4 border-b border-border pb-2">
              <h2 className="font-heading text-body-base font-bold text-foreground">Sesi berikutnya</h2>
              <Link
                href="/courses/tutorial-pka/jadwal"
                className="flex items-center gap-1 text-body-sm font-semibold text-brand-primary transition-colors duration-150 hover:text-brand-primary/80"
              >
                Semua jadwal
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
            {nextSession ? (
              <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="min-w-0">
                  <span className="block truncate text-body-base font-semibold text-foreground">
                    {nextSession.title}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-body-sm text-muted-foreground">
                    <CalendarDays className="size-3.5" />
                    <FormattedDate date={nextSession.sessionAt} options={{ dateStyle: "full", timeStyle: "short" }} />
                  </span>
                </div>
                {nextSession.meetLink ? (
                  <a
                    href={nextSession.meetLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex shrink-0 items-center gap-1.5 rounded-md bg-brand-primary px-3 py-1.5 text-body-sm font-semibold text-white transition-colors duration-150 hover:bg-brand-primary/90"
                  >
                    <Video className="size-4" />
                    Gabung Meet
                  </a>
                ) : (
                  <span className="flex shrink-0 items-center gap-1.5 rounded-md bg-muted px-3 py-1.5 text-body-sm font-semibold text-muted-foreground">
                    Link Belum Tersedia
                  </span>
                )}
              </div>
            ) : (
              <p className="py-2 text-body-sm text-muted-foreground">
                Belum ada sesi mendatang. Dari total {PKA_TOTAL_SESSIONS} sesi tutorial live, jadwal dan link
                Google Meet akan muncul di tab Jadwal dan dikirim ke email kamu.
              </p>
            )}
          </section>
        </Reveal>

        {/* Progress snapshot */}
        <Reveal>
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-4 border-b border-border pb-2">
              <h2 className="font-heading text-body-base font-bold text-foreground">Simulasi Ujian</h2>
              <Link
                href="/courses/tutorial-pka/leaderboard?type=simulation"
                className="flex items-center gap-1 text-body-sm font-semibold text-brand-primary transition-colors duration-150 hover:text-brand-primary/80"
              >
                <BarChart3 className="size-3.5" />
                Leaderboard Simulasi
              </Link>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="block text-body-base font-semibold text-foreground">
                  {simTemplates.length} Simulasi Tersedia
                </span>
                <span className="block text-body-sm text-muted-foreground">
                  {completedCount > 0
                    ? `Kamu telah menyelesaikan ${completedCount} simulasi. Skor tertinggi: ${bestScore}%`
                    : "Uji kesiapan akademis kamu dengan mengerjakan simulasi."}
                </span>
              </div>
              <Link
                href="/courses/tutorial-pka/simulasi"
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-brand-primary px-4 py-2 text-body-sm font-bold text-white shadow-xs transition-colors duration-150 hover:bg-brand-primary/90"
              >
                {completedCount > 0 ? "Lanjutkan simulasi" : "Buka simulasi"}
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </section>
        </Reveal>

        <Reveal>
          <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4">
            <ShieldAlert className="size-5 shrink-0 text-muted-foreground" />
            <p className="text-body-sm text-muted-foreground">{PKA_DISCLAIMER}</p>
          </div>
        </Reveal>
      </div>
    </CoursePageShell>
  );
}
