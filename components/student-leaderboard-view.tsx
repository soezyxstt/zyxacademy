import Link from "next/link";
import { Trophy, ChevronRight } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { PageHeader } from "@/components/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { studentCardClass } from "@/components/course/course-surfaces";
import { TranslatedText } from "@/components/i18n/translated-text";
export function StudentLeaderboardView({ href = (path: string) => path,  allCourses, leaderboardByCourse }: { href?: (path: string) => string; 
 allCourses: { id: string; title: string }[];
 leaderboardByCourse: Record<string, { rank: number; name: string; avgScore: number; attempts: number }[]>;
}) {

  return (
    <Reveal className="w-full px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      <PageHeader
        title={<TranslatedText namespace="student" messageKey="leaderboard.title" />}
        icon={Trophy}
      />

      {allCourses.length === 0 ? (
        <div className={studentCardClass("py-16 text-center max-w-md mx-auto bg-card/50 p-8 shadow-xs")}>
          <Trophy className="size-10 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-body-sm text-muted-foreground">
            <TranslatedText namespace="student" messageKey="leaderboard.noEnrollment" />{" "}
            <Link href={href("/courses")} className="text-brand-primary hover:underline font-semibold">
              <TranslatedText namespace="student" messageKey="leaderboard.browseCourses" />
            </Link>
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {allCourses.map((course) => {
            const rows = leaderboardByCourse[course.id] ?? [];

            return (
              <section key={course.id} className={studentCardClass("bg-card/45")}>
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
                  <div className="flex flex-col items-center justify-center py-10 text-center rounded-xl border border-dashed border-border bg-muted/10">
                    <Trophy className="size-8 text-muted-foreground/25 mb-2" />
                    <p className="text-body-sm text-muted-foreground"><TranslatedText namespace="student" messageKey="leaderboard.emptyCourse" /></p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead><TranslatedText namespace="student" messageKey="leaderboard.name" /></TableHead>
                      <TableHead className="text-right"><TranslatedText namespace="student" messageKey="leaderboard.score" /></TableHead>
                      <TableHead className="text-right"><TranslatedText namespace="student" messageKey="leaderboard.quizzes" /></TableHead>
                    </TableRow></TableHeader>
                    <TableBody>{rows.map((row) => (
                      <TableRow key={`${course.id}-${row.rank}`}>
                        <TableCell className="tabular-nums">{row.rank}</TableCell>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell className="text-right tabular-nums text-primary">{row.avgScore}%</TableCell>
                        <TableCell className="text-right tabular-nums">{row.attempts}</TableCell>
                      </TableRow>
                    ))}</TableBody>
                  </Table>
                )}
              </section>
            );
          })}
        </div>
      )}
    </Reveal>
  );
}
