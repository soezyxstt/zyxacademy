import Link from "next/link";
import { Trophy, ChevronRight } from "lucide-react";
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
        <div className="mx-auto max-w-md px-4 py-5 text-center">
          <Trophy className="size-10 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-body-sm text-muted-foreground">
            <TranslatedText namespace="student" messageKey="leaderboard.noEnrollment" />{" "}
            <Link href={href("/courses")} className="text-brand-primary hover:underline font-semibold">
              <TranslatedText namespace="student" messageKey="leaderboard.browseCourses" />
            </Link>
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/60 border-y border-border/60">
          {allCourses.map((course) => {
            const rows = leaderboardByCourse[course.id] ?? [];

            return (
              <section key={course.id} className="min-w-0 px-4 py-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-heading text-body-base font-bold text-foreground">
                    {course.title}
                  </h2>
                  <Link
                    href={href(`/courses/${course.id}/leaderboard`)}
                    className="flex items-center gap-1 text-body-xs font-semibold text-brand-primary hover:underline"
                  >
                    <TranslatedText namespace="student" messageKey="leaderboard.viewAll" />
                    <ChevronRight className="size-3.5" />
                  </Link>
                </div>

                {rows.length === 0 ? (
                  <div className="flex items-center gap-2 pb-1">
                    <Trophy className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <p className="text-body-sm text-muted-foreground"><TranslatedText namespace="student" messageKey="leaderboard.emptyCourse" /></p>
                  </div>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {rows.map((row) => (
                      <li key={row.rank} className="flex items-start gap-3 py-2">
                        <span className="w-6 shrink-0 pt-1 text-body-sm tabular-nums">{row.rank}</span>
                        <div className="min-w-0 flex-1">
                          <StudentIdentity name={row.name} identity={row.identity} />
                        </div>
                        <div className="shrink-0 text-right text-body-xs tabular-nums">
                          <div className="font-semibold text-primary">
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
    <Reveal className="w-full px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      <PageHeader title={<TranslatedText namespace="student" messageKey="leaderboard.title" />} icon={Trophy} />
      {content}
    </Reveal>
  );
}
