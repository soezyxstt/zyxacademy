import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { ArrowRight, CalendarDays, CheckCircle2, FileText, ShieldAlert, Video } from "lucide-react";
import { db } from "@/db";
import { courseMaterials, pkaAnnouncements } from "@/db/schema";
import { env } from "@/lib/env";
import { pageTitle } from "@/lib/site";
import {
  PKA_ASSUMED_TEST_DATE,
  PKA_COURSE_ID,
  PKA_DISCLAIMER,
  PKA_SUBJECTS,
  PKA_SUBJECT_LABELS,
  PKA_TOTAL_SESSIONS,
} from "@/lib/pka-config";
import { getSubjectStageState } from "@/lib/pka-simulation";
import { requirePkaSession } from "@/lib/pka-enrollment";
import { PkaCountdown } from "@/components/pka/pka-countdown";
import { SubjectStageList } from "@/components/pka/subject-stage-list";
import { Reveal } from "@/components/ui/reveal";

export const metadata: Metadata = {
  title: pageTitle("Tutorial PKA gratis"),
  description: "Tutorial gratis persiapan Pemetaan Kesiapan Akademik (PKA) ITB: jadwal sesi live, simulasi kuis, dan materi Matematika, Fisika, Kimia.",
};

export default async function PkaCourseHomePage() {
  if (env.FEATURE_PKA !== "1") notFound();

  const userId = await requirePkaSession("/pka");

  const [subjectStages, announcements, materials] = await Promise.all([
    Promise.all(
      PKA_SUBJECTS.map(async (subject) => ({
        subject,
        stages: await getSubjectStageState(userId, subject),
      })),
    ),
    db.select().from(pkaAnnouncements).orderBy(asc(pkaAnnouncements.sessionAt)),
    db.select().from(courseMaterials).where(eq(courseMaterials.courseId, PKA_COURSE_ID)),
  ]);

  const anyAttempted = subjectStages.some(({ stages }) => stages.some((s) => s.status === "completed"));
  const now = new Date();

  return (
    <div className="space-y-10">
      {/* Hero */}
      <Reveal>
        <div className="space-y-3">
          <span className="inline-flex items-center rounded-md bg-brand-secondary/10 px-2.5 py-1 text-body-sm font-semibold text-brand-secondary">
            Kampanye gratis untuk maba ITB
          </span>
          <h1 className="font-heading text-h4 font-bold text-foreground sm:text-h3">Tutorial PKA gratis</h1>
          <p className="text-body-base text-muted-foreground">
            Satu kelas untuk tiga mapel PKA: Matematika, Fisika, dan Kimia. Tutorial live via Google Meet
            diadakan {PKA_TOTAL_SESSIONS} kali sebelum pretest PKA berlangsung, lengkap dengan simulasi kuis
            bertingkat dan materi belajar.
          </p>
        </div>
      </Reveal>

      <Reveal>
        <PkaCountdown targetDate={PKA_ASSUMED_TEST_DATE.toISOString()} />
      </Reveal>

      {/* Schedule & announcements */}
      <Reveal>
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-4 border-b border-border pb-2">
            <h2 className="font-heading text-h6 font-bold text-foreground">Jadwal sesi tutorial</h2>
            <span className="text-body-sm text-muted-foreground">
              {Math.min(announcements.length, PKA_TOTAL_SESSIONS)} dari {PKA_TOTAL_SESSIONS} sesi dijadwalkan
            </span>
          </div>

          {announcements.length === 0 ? (
            <p className="py-4 text-body-sm text-muted-foreground">
              Belum ada sesi yang dijadwalkan. Jadwal dan link Google Meet akan muncul di sini dan dikirim ke
              email kamu setiap kali sesi diumumkan.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {announcements.map((a, idx) => {
                const isPast = a.sessionAt.getTime() < now.getTime();
                return (
                  <li key={a.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-body-sm font-bold text-foreground">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <span className="block truncate text-body-base font-semibold text-foreground">{a.title}</span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-body-sm text-muted-foreground">
                          <CalendarDays className="size-3.5" />
                          {a.sessionAt.toLocaleString("id-ID", { dateStyle: "full", timeStyle: "short" })}
                        </span>
                        {a.body && <p className="mt-1 text-body-sm text-muted-foreground">{a.body}</p>}
                      </div>
                    </div>
                    {isPast ? (
                      <span className="flex shrink-0 items-center gap-1 text-body-sm text-muted-foreground">
                        <CheckCircle2 className="size-4" />
                        Selesai
                      </span>
                    ) : (
                      <a
                        href={a.meetLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex shrink-0 items-center gap-1.5 rounded-md bg-brand-primary px-3 py-1.5 text-body-sm font-semibold text-white transition-colors duration-150 hover:bg-brand-primary/90"
                      >
                        <Video className="size-4" />
                        Gabung Meet
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </Reveal>

      {/* Simulation quizzes, all subjects in one place */}
      <Reveal>
        <section className="space-y-5">
          <div className="border-b border-border pb-2">
            <h2 className="font-heading text-h6 font-bold text-foreground">Simulasi kuis PKA</h2>
            <p className="mt-1 text-body-sm text-muted-foreground">
              Tiga stage per mapel, mengikuti alur tes aslinya: lolos di stage awal berarti stage berikutnya dilewati.
            </p>
          </div>
          <div className="space-y-6">
            {subjectStages.map(({ subject, stages }) => (
              <div key={subject} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <h3 className="mb-1 font-heading text-body-base font-bold text-foreground">
                  {PKA_SUBJECT_LABELS[subject]}
                </h3>
                <SubjectStageList subject={subject} stages={stages} />
              </div>
            ))}
          </div>
          {anyAttempted && (
            <Link
              href="/pka/report"
              className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm transition-colors duration-150 hover:border-brand-primary/50"
            >
              <span className="text-body-sm font-semibold text-foreground">Lihat laporan diagnostik lengkap</span>
              <ArrowRight className="size-4 text-brand-primary" />
            </Link>
          )}
        </section>
      </Reveal>

      {/* Materials */}
      <Reveal>
        <section className="space-y-3">
          <div className="border-b border-border pb-2">
            <h2 className="font-heading text-h6 font-bold text-foreground">Materi</h2>
          </div>
          {materials.length === 0 ? (
            <p className="py-4 text-body-sm text-muted-foreground">
              Materi belajar akan dibagikan di sini menjelang dan selama sesi tutorial berlangsung.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {materials.map((m) => (
                <li key={m.id}>
                  <a
                    href={m.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="-mx-2 flex items-center justify-between gap-4 rounded-lg px-2 py-3 transition-colors duration-150 hover:bg-muted/40"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-brand-primary">
                        <FileText className="size-5" />
                      </span>
                      <div className="min-w-0">
                        <span className="block truncate text-body-base font-semibold text-foreground">{m.title}</span>
                        <span className="text-body-sm text-muted-foreground">
                          {m.type === "materi_kelas" ? "Materi kelas" : "Contoh soal"}
                        </span>
                      </div>
                    </div>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </Reveal>

      <Reveal>
        <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4">
          <ShieldAlert className="size-5 shrink-0 text-muted-foreground" />
          <p className="text-body-sm text-muted-foreground">{PKA_DISCLAIMER}</p>
        </div>
      </Reveal>
    </div>
  );
}
