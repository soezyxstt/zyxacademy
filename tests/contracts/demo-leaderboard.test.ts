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
  const otherCourse = fictionalDemoSnapshot("course-b", "Fisika Dasar I");
  const otherBaseline = demoLeaderboard(otherCourse, emptyOverlay(), () => null, "Kamu");
  expect(demoLeaderboard(otherCourse, overlay, () => saved, "Kamu")).toEqual(otherBaseline);
  expect(demoLeaderboard(snapshot, overlay, () => saved, "Kamu", "simulation")).toEqual(demoLeaderboard(snapshot, emptyOverlay(), () => null, "Kamu", "simulation"));
  expect(demoLeaderboard(snapshot, overlay, () => "{bad", "Kamu").find(row => row.name === "Kamu")?.attempts).toBe(baseline.attempts);
});

test("course and assessment seeds have distinct stable peers, scores and activity", () => {
  const courseIds = ["ma1101", "fi1101", "ki1101", "wi1102", "fictional-berpikir", "fictional-fisika", "fictional-kimia", "fictional-matematika"];
  for (const type of ["quiz", "simulation"]) {
    const rankings = courseIds.map(courseId => {
      const snapshot = fictionalDemoSnapshot(courseId);
      const rows = demoLeaderboard(snapshot, emptyOverlay(), () => null, "Kamu", type);
      expect(demoLeaderboard(JSON.parse(JSON.stringify(snapshot)), emptyOverlay(), () => null, "Kamu", type)).toEqual(rows);
      const peers = rows.filter(row => row.studentId !== "fictional-demo-student");
      expect(new Set(peers.map(row => row.studentId)).size).toBe(3);
      for (const row of peers) {
        expect(row.avgScore).toBeGreaterThanOrEqual(62);
        expect(row.avgScore).toBeLessThanOrEqual(96);
        expect(row.attemptCount).toBeGreaterThan(0);
        expect(row.avgDuration).toBeGreaterThan(0);
        expect(row.correctHardCount).toBeGreaterThan(0);
        expect(row.attemptedMediumCount).toBeGreaterThan(0);
      }
      return peers;
    });
    for (const metric of ["studentId", "avgScore", "attemptCount", "avgDuration", "correctHardCount", "attemptedMediumCount"] as const) {
      expect(new Set(rankings.map(rows => JSON.stringify(rows.map(row => row[metric])))).size).toBe(courseIds.length);
    }
  }
  for (const courseId of courseIds) {
    const snapshot = fictionalDemoSnapshot(courseId);
    const quiz = demoLeaderboard(snapshot, emptyOverlay(), () => null, "Kamu");
    const simulation = demoLeaderboard(snapshot, emptyOverlay(), () => null, "Kamu", "simulation");
    expect(simulation.map(row => row.studentId)).not.toEqual(quiz.map(row => row.studentId));
    expect(simulation.map(row => row.avgScore)).not.toEqual(quiz.map(row => row.avgScore));
  }
});
