import { addCalendarDays, getCalendarWeekRange } from "@/lib/date-utils";
import type { PublicDemoSnapshot } from "@/lib/demo/snapshot";

export function demoReflections(snapshots: readonly PublicDemoSnapshot[]) {
  if (!snapshots.length) return [];
  const asOf = snapshots.reduce((latest, row) => row.asOf > latest ? row.asOf : latest, snapshots[0].asOf);
  const currentWeek = getCalendarWeekRange(asOf).startIso;
  const activeDays = new Set<string>();
  const weeks = new Map<string, { quizzes: number; flashcards: number; modules: number }>();
  for (const snapshot of snapshots) {
    for (const day of snapshot.history) {
      if (!(day.materialsCompleted || day.flashcardsReviewed || day.quizzesCompleted)) continue;
      activeDays.add(day.date);
      const week = getCalendarWeekRange(day.date).startIso;
      if (week >= currentWeek) continue;
      const counts = weeks.get(week) ?? { quizzes: 0, flashcards: 0, modules: 0 };
      counts.quizzes += day.quizzesCompleted;
      counts.flashcards += day.flashcardsReviewed;
      counts.modules += day.materialsCompleted;
      weeks.set(week, counts);
    }
  }
  const streaks = new Map<string, number>();
  const longestByWeek = new Map<string, number>();
  let previous = "";
  let currentStreak = 0;
  let longestStreak = 0;
  for (const date of [...activeDays].sort()) {
    currentStreak = previous === addCalendarDays(date, -1) ? currentStreak + 1 : 1;
    longestStreak = Math.max(longestStreak, currentStreak);
    streaks.set(date, currentStreak);
    longestByWeek.set(getCalendarWeekRange(date).startIso, longestStreak);
    previous = date;
  }
  return [...weeks.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([weekStart, completed]) => {
    const end = addCalendarDays(weekStart, 6);
    const currentStreak = streaks.get(end) ?? streaks.get(addCalendarDays(end, -1)) ?? 0;
    const longestStreak = longestByWeek.get(weekStart) ?? 0;
    return { id: `demo-week-${weekStart}`, weekStart, payload: { completed, streak: { currentStreak, longestStreak } } };
  });
}
