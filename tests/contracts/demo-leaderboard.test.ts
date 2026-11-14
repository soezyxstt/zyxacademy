import { expect, test } from "bun:test";
import { fictionalDemoSnapshot } from "@/lib/demo/fictional-snapshot";
import { demoLeaderboard } from "@/lib/demo/leaderboard";
import { emptyOverlay } from "@/lib/demo/session-overlay";
import { demoQuizEventKey, demoQuizIdentity, serializeDemoQuizResult } from "@/lib/demo/assessment/quiz";

test("per-course leaderboard uses validated completed attempts independently of drafts", () => {
  const snapshot = fictionalDemoSnapshot("course-a", "Matematika I");
  const question = { id: "q1", prompt: "Question", options: ["A", "B"], multiple: false };
  const identity = demoQuizIdentity(snapshot.courseId, snapshot.revision, 0, [question]);
  const id = `${demoQuizEventKey(identity)}:latest`;
  const saved = serializeDemoQuizResult(identity, { score: 1, total: 1, results: [{ index: 0, isCorrect: true, explanation: null }] }, { q1: [0] });
  const overlay = { ...emptyOverlay(), events: [{ kind: "quiz" as const, id, date: "2026-11-14" }] };
  const baseline = demoLeaderboard(snapshot, emptyOverlay(), () => null, "Kamu").find(row => row.name === "Kamu")!;
  const rows = demoLeaderboard(snapshot, overlay, key => key === `zyx-demo-quiz-result:v2:${id}` ? saved : '{"q1":[1]}', "Kamu");
  expect(rows.find(row => row.name === "Kamu")?.attempts).toBe(baseline.attempts + 1);
  expect(rows.map(row => row.rank)).toEqual([1, 2, 3, 4]);
  expect(demoLeaderboard({ ...snapshot, revision: "changed" }, overlay, () => saved, "Kamu").find(row => row.name === "Kamu")?.attempts).toBe(baseline.attempts);
  expect(demoLeaderboard(snapshot, overlay, () => "{bad", "Kamu").find(row => row.name === "Kamu")?.attempts).toBe(baseline.attempts);
});
