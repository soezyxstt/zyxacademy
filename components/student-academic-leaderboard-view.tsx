import Link from "next/link";
import { Trophy, ChevronRight } from "lucide-react";
import { ApplicationPage } from "@/components/application-page";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { PageHeader } from "@/components/page-header";
import { StudentIdentity } from "@/components/gamification/student-identity";
import type { StudentIdentity as PublicStudentIdentity } from "@/lib/gamification/social-contracts";
import { TranslatedText } from "@/components/i18n/translated-text";
export function StudentAcademicLeaderboardView({ href = (path: string) => path, embedded = false, allCourses, leaderboardByCourse }: { href?: (path: string) => string;
 embedded?: boolean;
 allCourses: { id: string; title: string }[];
 leaderboardByCourse: Record<string, { rank: number; name: string; avgScore: number; attempts: number; identity?: PublicStudentIdentity | null }[]>;
}) {

  const content = (
      allCourses.length === 0 ? (
        <div className="mx-auto max-w-md space-y-3 px-4 py-5 text-center">
          <Trophy className="size-10 text-muted-foreground/30 mx-auto" />
          <p className="text-body-sm text-muted-foreground">
            <TranslatedText namespace="student" messageKey="leaderboard.noEnrollment" />
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link href={href("/courses")}>
              <TranslatedText namespace="student" messageKey="leaderboard.browseCourses" />
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {allCourses.map((course) => {
            const rows = leaderboardByCourse[course.id] ?? [];

            return (
              <section key={course.id} className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2">
                  <h2 className="font-heading text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {course.title}
                  </h2>
                  <Link
                    href={href(`/courses/${course.id}/leaderboard`)}
                    className="group flex items-center gap-0.5 text-body-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <TranslatedText namespace="student" messageKey="leaderboard.viewAll" />
                    <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </div>

                {rows.length === 0 ? (
                  <div className="flex items-center gap-2 py-2">
                    <Trophy className="size-4 shrink-0 text-muted-foreground/60" aria-hidden />
                    <p className="text-body-sm text-muted-foreground"><TranslatedText namespace="student" messageKey="leaderboard.emptyCourse" /></p>
                  </div>
                ) : (
                  <ul className="divide-y divide-border/30">
                    {rows.map((row) => (
                      <li key={row.rank} className="flex items-start gap-3 py-2.5 px-2 -mx-2 rounded-lg transition-colors hover:bg-muted/40">
                        <span className="w-6 shrink-0 pt-0.5 text-body-sm font-medium text-muted-foreground tabular-nums">{row.rank}</span>
                        <div className="min-w-0 flex-1">
                          <StudentIdentity name={row.name} identity={row.identity} />
                        </div>
                        <div className="shrink-0 text-right text-body-xs tabular-nums">
                          <div className="font-semibold text-foreground">
                            <span className="sr-only"><TranslatedText namespace="student" messageKey="leaderboard.score" /> </span>
                            {row.avgScore}%
                          </div>
                          <div className="text-muted-foreground">
                            <TranslatedText namespace="student" messageKey="leaderboard.quizzes" /> {row.attempts}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )
  );

  if (embedded) return content;
  return (
    <ApplicationPage spacing="space-y-6">
      <PageHeader title={<TranslatedText namespace="student" messageKey="leaderboard.title" />} icon={Trophy} />
      <Reveal>{content}</Reveal>
    </ApplicationPage>
  );
}
