import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { CalendarDays, CalendarRange, CheckCircle2, Video } from "lucide-react";
import { db } from "@/db";
import { pkaSchedules } from "@/db/schema";
import { createMetadata } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";
import { TranslatedText } from "@/components/i18n/translated-text";
import { PKA_TOTAL_SESSIONS } from "@/lib/pka-config";
import { requirePkaSession } from "@/lib/pka-enrollment";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { FormattedDate } from "@/components/ui/formatted-date";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("studentExtras.pka");
  return createMetadata({ title: t("scheduleTitle"), description: t("scheduleDescription"), path: "/courses/tutorial-pka/jadwal" });
}


export default async function PkaJadwalPage() {
  await requirePkaSession("/courses/tutorial-pka/jadwal");

  const schedules = await db.select().from(pkaSchedules).orderBy(asc(pkaSchedules.sessionAt));
  const now = new Date();

  return (
    <CoursePageShell
      title={<TranslatedText namespace="studentExtras.pka" messageKey="schedulePageTitle" />}
      description={<TranslatedText namespace="studentExtras.pka" messageKey="schedulePageDescription" values={{ count: PKA_TOTAL_SESSIONS }} />}
      icon={CalendarRange}
    >
      <div className="space-y-8">
        <Reveal>
          <section className="space-y-3">
          <div className="border-b border-border pb-2">
            <h2 className="font-heading text-body-base font-bold text-foreground"><TranslatedText namespace="studentExtras.pka" messageKey="tutorialSessions" /></h2>
          </div>

          {schedules.length === 0 ? (
            <p className="py-4 text-body-sm text-muted-foreground">
              <TranslatedText namespace="studentExtras.pka" messageKey="noSessions" />
            </p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {schedules.map((a, idx) => {
                const isPast = a.sessionAt.getTime() < now.getTime();
                return (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-body-sm font-bold text-foreground">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <span className="block break-words text-body-base font-semibold text-foreground">{a.title}</span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-body-sm text-muted-foreground">
                          <CalendarDays className="size-3.5" />
                          <FormattedDate date={a.sessionAt} options={{ dateStyle: "full", timeStyle: "short" }} />
                        </span>
                      </div>
                    </div>
                    {isPast ? (
                      <span className="flex shrink-0 items-center gap-1 text-body-sm text-muted-foreground">
                        <CheckCircle2 className="size-4" />
                        <TranslatedText namespace="studentExtras.pka" messageKey="sessionCompleted" />
                      </span>
                    ) : (
                      a.meetLink ? (
                        <Button asChild size="sm">
                        <a
                          href={a.meetLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex shrink-0 items-center gap-1.5 rounded-md bg-brand-primary px-3 py-1.5 text-body-sm font-semibold text-primary-foreground transition-colors duration-150 hover:bg-brand-primary/90"
                        >
                          <Video className="size-4" />
                          <TranslatedText namespace="studentExtras.pka" messageKey="joinMeet" />
                        </a>
                        </Button>
                      ) : (
                        <span className="flex shrink-0 items-center gap-1.5 rounded-md bg-muted px-3 py-1.5 text-body-sm font-semibold text-muted-foreground">
                          <TranslatedText namespace="studentExtras.pka" messageKey="calendarLinkMissing" />
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
