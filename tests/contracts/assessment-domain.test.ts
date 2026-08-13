import { describe, expect, it } from "bun:test";
import { asesmenSchema, attemptSnapshotFromAnswer, attemptSnapshotsEqual, blueprintAsesmenSchema, cakupanAsesmenSchema, immutableAttemptSnapshotSchema, itemAsesmenSchema, jawabanMuridSchema, percobaanAsesmenSchema } from "@/lib/asesmen/contracts";

const now = "2026-08-02T00:00:00.000Z";
const scopeBase = { id: "assessment-1", blueprintId: "blueprint-1", title: "Quiz", version: 1, status: "published" as const, createdAt: now, updatedAt: now };

describe("Plan 004 assessment contracts", () => {
  it("accepts exactly one chapter for quiz and one or more for tryout", () => {
    expect(cakupanAsesmenSchema.parse({ assessmentType: "quiz", chapterIds: ["bab-1"] })).toBeTruthy();
    expect(cakupanAsesmenSchema.parse({ assessmentType: "tryout", chapterIds: ["bab-1", "bab-2"] })).toBeTruthy();
    expect(blueprintAsesmenSchema.parse({ id: "blueprint-1", version: 1, assessmentType: "quiz", chapterIds: ["bab-1"], blueprintHash: "hash-1" })).toBeTruthy();
    expect(asesmenSchema.parse({ ...scopeBase, scope: { assessmentType: "quiz", chapterIds: ["bab-1"] } })).toBeTruthy();
  });

  it("rejects invalid quiz and tryout scope plus unknown fields", () => {
    expect(cakupanAsesmenSchema.safeParse({ assessmentType: "quiz", chapterIds: ["bab-1", "bab-2"] }).success).toBe(false);
    expect(cakupanAsesmenSchema.safeParse({ assessmentType: "tryout", chapterIds: [] }).success).toBe(false);
    expect(cakupanAsesmenSchema.safeParse({ assessmentType: "quiz", chapterIds: ["bab-1"], extra: true }).success).toBe(false);
    expect(blueprintAsesmenSchema.safeParse({ id: "blueprint-1", version: 1, assessmentType: "quiz", chapterIds: ["bab-1", "bab-2"], blueprintHash: "hash-1" }).success).toBe(false);
    expect(itemAsesmenSchema.safeParse({ id: "item-1", assessmentId: "assessment-1", questionId: "question-1", orderIndex: 0, ideaIds: [], contentVersion: 1 }).success).toBe(false);
  });

  it("accepts immutable attempt snapshots with all historical fields", () => {
    const answer = jawabanMuridSchema.parse({ id: "answer-1", attemptId: "attempt-1", itemAssessmentId: "item-1", renderedQuestionSnapshot: { prompt: "1+1?", options: ["1", "2"] }, optionOrderSnapshot: ["opt-a", "opt-b"], responseSnapshot: { selected: "opt-b" }, gradingPolicySnapshot: { version: "rubric-1" }, contentVersionSnapshot: 3, submittedAt: now });
    const snapshot = attemptSnapshotFromAnswer(answer);
    expect(immutableAttemptSnapshotSchema.parse(snapshot).contentVersion).toBe(3);
    expect(snapshot.optionOrder).toEqual(["opt-a", "opt-b"]);
    expect(attemptSnapshotsEqual(snapshot, { ...snapshot })).toBe(true);
    expect(percobaanAsesmenSchema.parse({ id: "attempt-1", assessmentId: "assessment-1", muridId: "murid-1", status: "in_progress", startedAt: now, submittedAt: null })).toBeTruthy();
  });

  it("rejects incomplete or unknown snapshot fields", () => {
    expect(jawabanMuridSchema.safeParse({ id: "answer-1", attemptId: "attempt-1", itemAssessmentId: "item-1", renderedQuestionSnapshot: {}, optionOrderSnapshot: [], responseSnapshot: {}, contentVersionSnapshot: 1, submittedAt: now }).success).toBe(false);
    expect(immutableAttemptSnapshotSchema.safeParse({ renderedQuestion: {}, optionOrder: [], response: {}, gradingPolicy: {}, contentVersion: 1, unknown: true }).success).toBe(false);
  });
});
