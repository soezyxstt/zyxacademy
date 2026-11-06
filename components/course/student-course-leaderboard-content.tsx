import { Trophy } from "lucide-react";
import { TranslatedText } from "@/components/i18n/translated-text";
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

export function StudentCourseLeaderboardContent({ rankedRows, userId, activeType, isPka = false }: {
 rankedRows: Awaited<ReturnType<typeof getCourseLeaderboard>>; userId?: string;
 activeType: "quiz" | "simulation"; isPka?: boolean;
}) {
  const totalStudents = rankedRows.length;
  const myEntry = rankedRows.find((r) => r.studentId === userId);
  const top3 = rankedRows.slice(0, 3);
  const typeLabel = activeType === "simulation" ? (isPka ? "simulation" : "tryout") : "quiz";

  return (
    <>
      {/* User's own ranking status card */}
      <div className="mb-4 rounded-xl border border-border/70 bg-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-heading text-body-base font-bold text-foreground">
            <TranslatedText namespace="learning" messageKey="leaderboard.yourRank" />
          </h3>
          <p className="text-body-sm text-muted-foreground mt-1">
            <TranslatedText namespace="learning" messageKey="leaderboard.basedOn" values={{ type: typeLabel }} />
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Trophy className="size-5 text-brand-secondary" />
          <div className="text-body-base font-semibold text-foreground">
            {myEntry ? (
              <TranslatedText namespace="learning" messageKey="leaderboard.rankOf" values={{ rank: myEntry.rank, total: totalStudents }} />
            ) : (
              <TranslatedText namespace="learning" messageKey="leaderboard.noScore" values={{ total: totalStudents, type: typeLabel }} />
            )}
          </div>
        </div>
      </div>

      {rankedRows.length === 0 ? (
        <div className="py-8 text-center max-w-md mx-auto bg-card p-4 border border-border rounded-xl">
          <Trophy className="size-10 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="font-heading text-body-base font-bold text-foreground mb-1">
            <TranslatedText namespace="learning" messageKey="leaderboard.emptyTitle" values={{ type: typeLabel }} />
          </h3>
          <p className="text-body-sm text-muted-foreground">
            {activeType === "simulation"
              ? <TranslatedText namespace="learning" messageKey="leaderboard.emptyTryout" />
              : <TranslatedText namespace="learning" messageKey="leaderboard.emptyQuiz" />}
          </p>
        </div>
      ) : (
        <section aria-labelledby="leaderboard-top-label" className="overflow-hidden rounded-xl border border-border/70 bg-card">
          <h2 id="leaderboard-top-label" className="border-b border-border/60 px-4 py-3 font-heading text-body-base font-bold"><TranslatedText namespace="learning" messageKey="leaderboard.topThree" /></h2>
          <ol className="divide-y divide-border/60">
            {top3.map((entry) => (
              <li key={entry.studentId} className="flex items-start gap-3 px-4 py-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-body-sm font-semibold">{entry.rank}</span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-body-sm font-semibold">{entry.studentName}</p>
                  <p className="mt-1 text-body-xs text-muted-foreground">
                    <TranslatedText namespace="learning" messageKey="leaderboard.attemptDuration" values={{ count: entry.attemptCount, type: typeLabel, duration: formatDuration(entry.avgDuration) }} />
                  </p>
                  <p className="mt-0.5 text-body-xs text-muted-foreground"><TranslatedText namespace="learning" messageKey="leaderboard.questionStats" values={{ hard: entry.correctHardCount, medium: entry.attemptedMediumCount }} /></p>
                </div>
                <span className="shrink-0 text-body-base font-bold text-brand-primary">{entry.avgScore}%</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
