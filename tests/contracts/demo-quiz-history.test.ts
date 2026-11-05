import { expect, test } from "bun:test";
import { fictionalDemoSnapshot } from "@/lib/demo/fictional-snapshot";
import { fictionalQuizHistory, localQuizHistory } from "@/lib/demo/assessment/history";
import { demoQuizIdentity, demoQuizEventKey, serializeDemoQuizResult } from "@/lib/demo/assessment/quiz";
const snapshot = fictionalDemoSnapshot("course");
const identity = demoQuizIdentity("course", snapshot.revision, 0, [{ id: "question", prompt: "P", options: ["A", "B"], multiple: false }]);
const id = "11111111-1111-4111-8111-111111111111";
const event = { kind: "quiz" as const, id: `${demoQuizEventKey(identity)}:${id}`, date: "2026-06-30" };
const raw = serializeDemoQuizResult(identity, { score: 1, total: 1, results: [{ index: 0, isCorrect: true, correctIndices: [0], explanation: null }] }, { question: [0] });
test("baseline and newly graded attempts populate the same student history model", () => {
 expect(fictionalQuizHistory(snapshot).length).toBeGreaterThan(0);
 const rows = localQuizHistory(snapshot, { version: 1, events: [event] }, () => raw);
 expect(rows).toHaveLength(1); expect(rows[0].id).toBe(id); expect(rows[0].score).toBe(100);
 expect(JSON.stringify(rows)).not.toMatch(/correctIndices|question|answers/);
});
test("local history rejects other courses, revisions, corrupt results and unavailable storage", () => {
 for (const baseline of [{ ...snapshot, courseId: "foreign" }, { ...snapshot, revision: "old" }]) expect(localQuizHistory(baseline, { version: 1, events: [event] }, () => raw)).toEqual([]);
 expect(localQuizHistory(snapshot, { version: 1, events: [{ ...event, id: "quiz-v2-forged" }] }, () => raw)).toEqual([]);
 expect(localQuizHistory(snapshot, { version: 1, events: [event] }, () => "{broken")).toEqual([]);
 expect(localQuizHistory(snapshot, { version: 1, events: [event] }, () => { throw new Error("storage unavailable"); })).toEqual([]);
});
