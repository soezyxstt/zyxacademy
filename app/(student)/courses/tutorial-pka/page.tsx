import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, eq, gt } from "drizzle-orm";
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
import { pkaAnnouncements, pkaSchedules } from "@/db/schema";
import { pageTitle } from "@/lib/site";
import { cn } from "@/lib/utils";
import {
  PKA_ASSUMED_TEST_DATE,
  PKA_DISCLAIMER,
  PKA_SUBJECTS,
  PKA_SUBJECT_LABELS,
  PKA_TOTAL_SESSIONS,
} from "@/lib/pka-config";
import { getDiagnosticSummary, type PkaSubjectDiagnosticStatus } from "@/lib/pka-simulation";
import { requirePkaSession } from "@/lib/pka-enrollment";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { PkaCountdown } from "@/components/pka/pka-countdown";
import { Reveal } from "@/components/ui/reveal";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { FormattedDate } from "@/components/ui/formatted-date";

export const metadata: Metadata = {
  title: pageTitle("Tutorial PKA"),
  description:
    "Persiapan Pemetaan Kesiapan Akademik (PKA) ITB: jadwal sesi live, simulasi kuis bertingkat, dan materi Matematika, Fisika, Kimia.",
};

const STATUS_CHIP: Record<PkaSubjectDiagnosticStatus, { label: string; className: string }> = {
  not_attempted: { label: "Belum dicoba", className: "bg-muted text-muted-foreground" },
  at_risk: { label: "Perlu perhatian", className: "bg-status-error/10 text-status-error" },
  borderline: { label: "Perkuat dasar", className: "bg-status-warning/10 text-status-warning" },
  solid: { label: "Solid", className: "bg-status-success/10 text-status-success" },
};

export default async function PkaCourseHomePage() {
  const userId = await requirePkaSession("/courses/tutorial-pka");

  const now = new Date();
  const [diagnostics, upcoming, announcements] = await Promise.all([
    getDiagnosticSummary(userId, PKA_SUBJECTS),
    db
      .select()
      .from(pkaSchedules)
      .where(gt(pkaSchedules.sessionAt, now))
      .orderBy(asc(pkaSchedules.sessionAt))
      .limit(1),
    db
      .select()
      .from(pkaAnnouncements)
      .where(eq(pkaAnnouncements.isArchived, false))
      .orderBy(desc(pkaAnnouncements.createdAt))
      .limit(1),
  ]);

  const nextSession = upcoming[0] ?? null;
  const latestAnnouncement = announcements[0] ?? null;
  const anyAttempted = diagnostics.some((d) => d.attempted);

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

        {/* Latest Announcement */}
        {latestAnnouncement && (
          <Reveal>
            <section className="space-y-3">
              <div className="flex items-center gap-2 border-b border-border pb-2">
                <BellRing className="size-5 text-brand-primary" />
                <h2 className="font-heading text-h6 font-bold text-foreground">Pengumuman Terbaru</h2>
              </div>
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-heading text-h6 font-bold text-foreground">
                    {latestAnnouncement.title}
                  </h3>
                  <span className="text-body-xs text-muted-foreground">
                    <FormattedDate date={latestAnnouncement.createdAt} options={{ dateStyle: "long", timeStyle: "short" }} />
                  </span>
                </div>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <MarkdownRenderer content={latestAnnouncement.body} />
                </div>
              </div>
            </section>
          </Reveal>
        )}

        {/* Next session */}
        <Reveal>
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-4 border-b border-border pb-2">
              <h2 className="font-heading text-h6 font-bold text-foreground">Sesi berikutnya</h2>
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
              <h2 className="font-heading text-h6 font-bold text-foreground">Progres simulasi</h2>
              {anyAttempted && (
                <Link
                  href="/courses/tutorial-pka/laporan"
                  className="flex items-center gap-1 text-body-sm font-semibold text-brand-primary transition-colors duration-150 hover:text-brand-primary/80"
                >
                  <BarChart3 className="size-3.5" />
                  Laporan diagnostik
                </Link>
              )}
            </div>
            <ul className="divide-y divide-border">
              {diagnostics.map((d) => {
                const chip = STATUS_CHIP[d.status];
                return (
                  <li key={d.subject} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <span className="block text-body-base font-semibold text-foreground">
                        {PKA_SUBJECT_LABELS[d.subject]}
                      </span>
                      <span className="block text-body-sm text-muted-foreground">{d.message}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {d.bestScore != null && (
                        <span className="text-body-sm font-semibold text-foreground">{d.bestScore}%</span>
                      )}
                      <span className={cn("rounded-md px-2 py-0.5 text-body-sm font-semibold", chip.className)}>
                        {chip.label}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
            <Link
              href="/courses/tutorial-pka/simulasi"
              className="inline-flex items-center gap-1.5 rounded-md bg-brand-primary px-4 py-2 text-body-sm font-bold text-white shadow-sm transition-colors duration-150 hover:bg-brand-primary/90"
            >
              {anyAttempted ? "Lanjutkan simulasi" : "Mulai simulasi"}
              <ArrowRight className="size-4" />
            </Link>
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
