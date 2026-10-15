import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BookmarkCheck, ArrowRight, ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { weeklyReflections } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { PageOrnaments } from "@/components/ui/page-ornaments";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { pageTitle } from "@/lib/site";

export const metadata: Metadata = {
  title: pageTitle("Refleksi Mingguan"),
  description: "Perkembangan belajar mingguan, aktivitas yang diselesaikan, dan pertumbuhan pemahaman materi Anda di Zyx Academy.",
};

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des"
];

function formatWeekLabel(weekStartStr: string): string {
  const parts = weekStartStr.split("-");
  if (parts.length !== 3) return weekStartStr;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  const monday = new Date(Date.UTC(year, month, day));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  const startStr = `${monday.getUTCDate()} ${MONTH_NAMES[monday.getUTCMonth()]}`;
  const endStr = `${sunday.getUTCDate()} ${MONTH_NAMES[sunday.getUTCMonth()]} ${sunday.getUTCFullYear()}`;

  return `${startStr} - ${endStr}`;
}

export default async function ReflectionsArchivePage() {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });

  if (!session?.user) {
    redirect("/sign-in?next=/profile/reflections");
  }

  const reflections = await db
    .select()
    .from(weeklyReflections)
    .where(eq(weeklyReflections.studentId, session.user.id))
    .orderBy(desc(weeklyReflections.weekStart));

  return (
    <div className="relative overflow-hidden min-h-screen">
      <PageOrnaments variant="about" />
      <div className="relative z-10 w-full px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        <PageHeader
          title="Refleksi Mingguan"
          icon={BookmarkCheck}
          backHref="/profile"
          backLabel="Profil"
        />

        <Reveal className="mt-6">
          <div className="rounded-xl border border-border bg-card p-4">
            {reflections.length > 0 ? (
              <div className="divide-y divide-border/60">
                {reflections.map((ref) => {
                  const label = formatWeekLabel(ref.weekStart);
                  const { completed, masteryGrowth, streak } = ref.payload;

                  return (
                    <div key={ref.id} className="py-4 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <span className="text-body-sm font-semibold text-foreground">
                          Minggu {label}
                        </span>
                        <div className="flex flex-wrap gap-x-5 gap-y-1 text-body-xs text-muted-foreground mt-1.5">
                          <span>{completed.quizzes} kuis</span>
                          <span>{completed.flashcards} flashcard</span>
                          <span>{completed.modules} materi</span>
                          <span>Streak {streak.currentStreak} hari</span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        {masteryGrowth > 0 ? (
                          <span className="font-heading text-body-base font-bold text-status-success">
                            +{masteryGrowth}
                          </span>
                        ) : (
                          <span className="font-heading text-body-base font-bold text-muted-foreground">
                            {masteryGrowth}
                          </span>
                        )}
                        <span className="block text-[10px] uppercase font-bold tracking-wider text-muted-foreground mt-0.5">
                          Penguasaan
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-12 text-center">
                <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
                  <BookmarkCheck className="size-6" />
                </div>
                <h3 className="font-heading text-body-base font-bold text-foreground">
                  Belum ada catatan refleksi mingguan
                </h3>
                <p className="mx-auto mt-1 max-w-md text-body-sm text-muted-foreground">
                  Tersedia setelah minggu belajar aktif pertama.
                </p>
                <div className="mt-5">
                  <Button asChild size="sm" className="rounded-lg text-body-sm">
                    <Link href="/dashboard">
                      Mulai belajar
                      <ArrowRight className="ml-1.5 size-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Reveal>
      </div>
    </div>
  );
}
