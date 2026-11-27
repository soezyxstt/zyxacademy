import { summarizeCourseLeaderboard } from "../../../../lib/student/course-leaderboard";
import type { CourseRanking, LeaderboardPage, StudentIdentity } from "./contracts";

export const rankingCourse = { id: "matematika-1", title: "Matematika I" } as const;
export const rankingIdentity = {
  publicId: "nara-putri", displayName: "Nara Putri", avatarUrl: null, rankKey: "kades", equippedFrameId: null, equippedThemeId: null,
} satisfies StudentIdentity;
export const rankingEvidence = {
  locale: "id",
  theme: "light",
  timeZone: "Asia/Jakarta",
  scenario: "ranking-parity",
  unrankedScenario: "ranking-parity-unranked",
  coursePath: `/courses/${rankingCourse.id}/leaderboard`,
  participationPath: "/leaderboard",
} as const;

export const rankingViewerId = "fixture-viewer";
export const coursePodiumIdentities: Record<string, StudentIdentity> = { "fixture-nara": rankingIdentity };
export const courseFixtureRows = [
  { studentId: "fixture-nara", studentName: rankingIdentity.displayName, avgScore: 94.5, attemptCount: 4, avgDuration: 132, correctHardCount: 3, attemptedMediumCount: 6 },
  { studentId: "fixture-raisa", studentName: "Raisa Dewi", avgScore: 92, attemptCount: 4, avgDuration: 147, correctHardCount: 2, attemptedMediumCount: 6 },
  { studentId: "fixture-gilang", studentName: "Gilang Pratama", avgScore: 90, attemptCount: 3, avgDuration: 156, correctHardCount: 1, attemptedMediumCount: 5 },
  { studentId: "fixture-other", studentName: "Bagas Ilham", avgScore: 89, attemptCount: 3, avgDuration: 180, correctHardCount: 1, attemptedMediumCount: 4 },
  { studentId: rankingViewerId, studentName: "Aruni Rasyid", avgScore: 88, attemptCount: 3, avgDuration: 183, correctHardCount: 0, attemptedMediumCount: 4 },
].map((row, index) => ({ ...row, rank: index + 1, userId: row.studentId, displayName: row.studentName, attempts: row.attemptCount, score: row.avgScore }));

export function courseRankingFixture(assessment: CourseRanking["assessment"], unranked: boolean): CourseRanking {
  const viewer = unranked ? undefined : rankingViewerId;
  const { topRows, ownRank, totalStudents } = summarizeCourseLeaderboard(assessment === "quiz" ? courseFixtureRows : [], viewer);
  return { course: rankingCourse, assessment, ownRank, totalStudents, rows: topRows.map(row => ({
    rank: row.rank, name: row.studentName, average: row.avgScore, attempts: row.attemptCount,
    identity: coursePodiumIdentities[row.studentId] ?? null, isSelf: row.studentId === viewer,
    averageDurationSeconds: row.avgDuration, correctHardCount: row.correctHardCount, attemptedMediumCount: row.attemptedMediumCount,
  })) };
}

export const rankedStudent = {
  ...rankingIdentity, position: 1, baseXpMicro: 165_000_000, avatarMode: "photo", avatarBadgeId: null, badgeTier: null,
} as const;
export const globalPeer = {
  ...rankedStudent, publicId: "satrio-wibowo", displayName: "Satrio Wibowo", position: 2, baseXpMicro: 141_000_000,
} as const;

/** Visible participants for this synthetic viewer, who has opted out and follows Nara. */
export function participationRankingFixture({ period, scope, followsNara, blocked }: {
  period: string | null; scope: string | null; followsNara: boolean; blocked: boolean;
}): LeaderboardPage {
  const entries = [];
  if (period !== "month") {
    if (!blocked && (scope !== "following" || followsNara)) entries.push(rankedStudent);
    if (scope !== "following") entries.push({ ...globalPeer, position: entries.length + 1 });
  }
  return { entries, ownEntry: null, nextCursor: null };
}
