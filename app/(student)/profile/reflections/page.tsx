import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { weeklyReflections } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { ShellPage } from "@/components/shell-page";
import { PageOrnaments } from "@/components/ui/page-ornaments";
import { pageTitle } from "@/lib/site";

export const metadata: Metadata = {
  title: pageTitle("Weekly Reflections"),
  description: "Your weekly learning progress, completed activities, and mastery growth.",
};

function formatWeekLabel(weekStartStr: string): string {
  const parts = weekStartStr.split("-");
  if (parts.length !== 3) return weekStartStr;
  
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  
  // Use UTC to prevent local timezone offsets from shifting dates
  const monday = new Date(Date.UTC(year, month, day));
  
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
  const monStr = monday.toLocaleDateString("en-US", options);
  const sunStr = sunday.toLocaleDateString("en-US", options);
  
  return `${monStr} to ${sunStr}`;
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
      <div className="relative z-10">
        <ShellPage title="Weekly reflections">
          <div className="max-w-3xl mx-auto pb-16">
            {reflections.length > 0 ? (
              <div className="divide-y divide-border border-t border-border">
                {reflections.map((ref) => {
                  const label = formatWeekLabel(ref.weekStart);
                  const { completed, masteryGrowth, streak } = ref.payload;
                  
                  return (
                    <div key={ref.id} className="py-4 flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <span className="text-body-sm font-medium text-foreground">
                          {label}
                        </span>
                        <div className="flex flex-wrap gap-x-6 gap-y-0.5 text-body-sm text-muted-foreground mt-1">
                          <span>{completed.quizzes} quizzes</span>
                          <span>{completed.flashcards} flashcards</span>
                          <span>{completed.modules} modules</span>
                          <span>{streak.currentStreak} day streak</span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        {masteryGrowth > 0 ? (
                          <span className="font-heading text-body-lg font-bold text-status-success">
                            +{masteryGrowth}
                          </span>
                        ) : (
                          <span className="font-heading text-body-lg font-bold text-muted-foreground">
                            {masteryGrowth}
                          </span>
                        )}
                        <span className="block text-[10px] uppercase font-bold tracking-wider text-muted-foreground mt-0.5">
                          Mastery
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-12 text-center">
                <p className="text-body-sm text-muted-foreground">
                  Reflections appear after your first active week.
                </p>
              </div>
            )}
          </div>
        </ShellPage>
      </div>
    </div>
  );
}
