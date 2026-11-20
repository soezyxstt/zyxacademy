import { Trophy } from "lucide-react";
import { TranslatedText } from "@/components/i18n/translated-text";
import { StudentIdentity } from "@/components/gamification/student-identity";
import type { StudentIdentity as PublicStudentIdentity } from "@/lib/gamification/social-contracts";
import type { getCourseLeaderboard } from "@/lib/course-utils";
function formatDuration(seconds: number) {
  if (!seconds || seconds <= 0) return "0s";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

export function StudentCourseLeaderboardContent({ rankedRows, userId, activeType, isPka = false, identities = {} }: {
 rankedRows: Awaited<ReturnType<typeof getCourseLeaderboard>>; userId?: string;
 activeType: "quiz" | "simulation"; isPka?: boolean; identities?: Record<string, PublicStudentIdentity>;
}) {
  const totalStudents = rankedRows.length;
  const myEntry = rankedRows.find((r) => r.studentId === userId);
  const top3 = rankedRows.slice(0, 3);
  const typeLabel = activeType === "simulation" ? (isPka ? "simulation" : "tryout") : "quiz";

  return (
    <div className="space-y-8">
      <section className="min-w-0">
        <div className="mb-3 border-b border-border/40 pb-2">
          <h3 className="font-heading text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <TranslatedText namespace="learning" messageKey="leaderboard.yourRank" />
          </h3>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-body-sm text-muted-foreground">
            <TranslatedText namespace="learning" messageKey="leaderboard.basedOn" values={{ type: typeLabel }} />
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <Trophy className="size-4 text-brand-secondary" aria-hidden="true" />
            <div className="text-body-base font-semibold tabular-nums text-foreground">
              {myEntry ? (
                <TranslatedText namespace="learning" messageKey="leaderboard.rankOf" values={{ rank: myEntry.rank, total: totalStudents }} />
              ) : (
                <TranslatedText namespace="learning" messageKey="leaderboard.noScore" values={{ total: totalStudents, type: typeLabel }} />
              )}
            </div>
          </div>
        </div>
      </section>

      {rankedRows.length === 0 ? (
        <div className="flex min-h-[45vh] flex-col items-center justify-center px-4 py-12 text-center">
          <div className="mx-auto flex max-w-md flex-col items-center">
            <Trophy className="size-10 text-muted-foreground/30 mb-3" aria-hidden />
            <h3 className="font-heading text-body-base font-bold text-foreground mb-1">
              <TranslatedText namespace="learning" messageKey="leaderboard.emptyTitle" values={{ type: typeLabel }} />
            </h3>
            <p className="text-body-sm text-muted-foreground">
              {activeType === "simulation"
                ? <TranslatedText namespace="learning" messageKey="leaderboard.emptyTryout" />
                : <TranslatedText namespace="learning" messageKey="leaderboard.emptyQuiz" />}
            </p>
          </div>
        </div>
      ) : (
        <section aria-labelledby="leaderboard-top-label" className="min-w-0">
          <h2 id="leaderboard-top-label" className="mb-1.5 border-b border-border/40 pb-2 font-heading text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <TranslatedText namespace="learning" messageKey="leaderboard.topThree" />
          </h2>
          <ol className="divide-y divide-border/30">
            {top3.map((entry) => (
              <li key={entry.studentId} className="flex items-start gap-3 py-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-body-sm font-semibold tabular-nums">{entry.rank}</span>
                <div className="min-w-0 flex-1">
                  <StudentIdentity name={entry.studentName} identity={identities[entry.studentId]} />
                  <p className="mt-1 text-body-xs text-muted-foreground">
                    <TranslatedText namespace="learning" messageKey="leaderboard.attemptDuration" values={{ count: entry.attemptCount, type: typeLabel, duration: formatDuration(entry.avgDuration) }} />
                  </p>
                  <p className="mt-0.5 text-body-xs text-muted-foreground"><TranslatedText namespace="learning" messageKey="leaderboard.questionStats" values={{ hard: entry.correctHardCount, medium: entry.attemptedMediumCount }} /></p>
                </div>
                <span className="shrink-0 text-body-base font-bold tabular-nums text-brand-primary">{entry.avgScore}%</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
