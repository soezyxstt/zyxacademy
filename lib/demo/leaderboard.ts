import type { PublicDemoSnapshot } from "./snapshot";
import type { DemoOverlay } from "./session-overlay";
import { fictionalQuizHistory, localQuizHistory } from "./assessment/history";

/** Rankings stay inside one course and use completed attempts, never an editable draft. */
export function demoLeaderboard(snapshot: PublicDemoSnapshot, overlay: DemoOverlay, read: (key: string) => string | null, name: string, type = "quiz") {
  const attempts = type === "quiz" ? [...fictionalQuizHistory(snapshot), ...localQuizHistory(snapshot, overlay, read)] : [];
  const peers = [
    { studentId: "fictional-ayu", displayName: "Ayu", avgScore: 92, attemptCount: 4 },
    { studentId: "fictional-bima", displayName: "Bima", avgScore: 81, attemptCount: 3 },
    { studentId: "fictional-citra", displayName: "Citra", avgScore: 73, attemptCount: 4 },
  ];
  return [...peers, { studentId: "fictional-demo-student", displayName: name,
    avgScore: attempts.length ? Math.round(attempts.reduce((sum, attempt) => sum + attempt.score, 0) / attempts.length) : 0,
    attemptCount: attempts.length,
  }].sort((a, b) => b.avgScore - a.avgScore || a.displayName.localeCompare(b.displayName, "id"))
    .map((row, index) => ({ ...row, rank: index + 1, name: row.displayName, userId: row.studentId, studentName: row.displayName,
      attempts: row.attemptCount, score: row.avgScore, avgDuration: 0, correctHardCount: 0, attemptedMediumCount: 0 }));
}
