import type { PublicDemoSnapshot } from "./snapshot";
import type { DemoOverlay } from "./session-overlay";
import { fictionalQuizHistory, localQuizHistory } from "./assessment/history";

function seed(value: string) {
  return [...value].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261);
}

/** Rankings stay inside one course and use completed attempts, never an editable draft. */
export function demoLeaderboard(snapshot: PublicDemoSnapshot, overlay: DemoOverlay, read: (key: string) => string | null, name: string, type = "quiz") {
  const attempts = type === "quiz" ? [...fictionalQuizHistory(snapshot), ...localQuizHistory(snapshot, overlay, read)] : [];
  const peers = ["Ayu", "Bima", "Citra", "Dimas", "Farah", "Intan", "Nadia", "Raka"].map(displayName => {
    const scope = `${snapshot.courseId}:${type}:${displayName}`;
    return { studentId: `fictional-${displayName.toLowerCase()}`, displayName,
      avgScore: 62 + seed(`${scope}:score`) % 35, attemptCount: 2 + seed(`${scope}:attempts`) % 7,
      avgDuration: (type === "quiz" ? 180 : 1800) + seed(`${scope}:duration`) % (type === "quiz" ? 540 : 2400),
      correctHardCount: 1 + seed(`${scope}:hard`) % 9, attemptedMediumCount: 4 + seed(`${scope}:medium`) % 15,
    };
  }).sort((a, b) => seed(`${snapshot.courseId}:${type}:${a.studentId}`) - seed(`${snapshot.courseId}:${type}:${b.studentId}`)).slice(0, 3);
  const durations = attempts.flatMap(attempt => attempt.durationSeconds === null ? [] : [attempt.durationSeconds]);
  return [...peers, { studentId: "fictional-demo-student", displayName: name,
    avgScore: attempts.length ? Math.round(attempts.reduce((sum, attempt) => sum + attempt.score, 0) / attempts.length) : 0,
    attemptCount: attempts.length,
    avgDuration: durations.length ? Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length) : 0,
    correctHardCount: 0, attemptedMediumCount: 0,
  }].sort((a, b) => b.avgScore - a.avgScore || a.avgDuration - b.avgDuration || b.correctHardCount - a.correctHardCount || b.attemptedMediumCount - a.attemptedMediumCount || a.displayName.localeCompare(b.displayName, "id"))
    .map((row, index) => ({ ...row, rank: index + 1, name: row.displayName, userId: row.studentId, studentName: row.displayName,
      attempts: row.attemptCount, score: row.avgScore }));
}
