export function summarizeCourseLeaderboard<Row extends { studentId: string; rank: number }>(rows: readonly Row[], userId?: string) {
  return {
    topRows: rows.slice(0, 3),
    ownRank: rows.find(row => row.studentId === userId)?.rank ?? null,
    totalStudents: rows.length,
  };
}

export function formatCourseLeaderboardDuration(seconds: number) {
  if (!seconds || seconds <= 0) return "0s";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`;
}
