import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { CalendarDays, CalendarRange, CheckCircle2, Video } from "lucide-react";
import { db } from "@/db";
import { pkaSchedules } from "@/db/schema";
import { pageTitle } from "@/lib/site";
import { PKA_TOTAL_SESSIONS } from "@/lib/pka-config";
import { requirePkaSession } from "@/lib/pka-enrollment";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { Reveal } from "@/components/ui/reveal";

export const metadata: Metadata = {
  title: pageTitle("Tutorial PKA - Jadwal"),
  description: "Jadwal sesi tutorial live PKA lengkap dengan link Google Meet.",
};

export default async function PkaJadwalPage() {
  await requirePkaSession("/courses/tutorial-pka/jadwal");

  const schedules = await db.select().from(pkaSchedules).orderBy(asc(pkaSchedules.sessionAt));
  const now = new Date();

  return (
    <CoursePageShell
      title="Jadwal Live Tutorial"
      description={`Tutorial live via Google Meet diadakan ${PKA_TOTAL_SESSIONS} kali sebelum pretest PKA berlangsung.`}
      icon={CalendarRange}
    >
      <div className="space-y-8">
        <Reveal>
          <section className="space-y-3">
          <div className="border-b border-border pb-2">
            <h2 className="font-heading text-h6 font-bold text-foreground">Sesi tutorial</h2>
          </div>

          {schedules.length === 0 ? (
            <p className="py-4 text-body-sm text-muted-foreground">
              Belum ada sesi yang dijadwalkan. Jadwal dan link Google Meet akan muncul di sini dan dikirim ke
              email kamu setiap kali sesi diumumkan.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {schedules.map((a, idx) => {
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
                      </div>
                    </div>
                    {isPast ? (
                      <span className="flex shrink-0 items-center gap-1 text-body-sm text-muted-foreground">
                        <CheckCircle2 className="size-4" />
                        Selesai
                      </span>
                    ) : (
                      a.meetLink ? (
                        <a
                          href={a.meetLink}
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
                      )
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          </section>
        </Reveal>
      </div>
    </CoursePageShell>
  );
}
