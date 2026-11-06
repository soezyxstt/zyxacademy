import { describe, expect, test } from "bun:test";
import { getAuthorizedFreeQuestionIds } from "@/lib/demo/free-quiz-policy";

const template = { status: "published" as const, visibility: "free" as const, category: "chapter" as const,
  selectionRules: { chapterIds: ["bab-1"], fixedQuestionIds: ["q1", "q2"] } };
const items = ["q1", "q2"].map((questionId) => ({ questionId, courseId: "course", chapterId: "bab-1", status: "published", version: 1, contentVersion: 1 }));
const input = { template, courseId: "course", chapterIds: ["bab-1", "legacy-1"], coverage: ["bab-1"], items };

describe("public demo Free quiz gate", () => {
  test("allows the canonical items of an explicitly scoped Free template", () => {
    expect(getAuthorizedFreeQuestionIds(input)).toEqual(["q1", "q2"]);
  });
  test("rejects paid, premium, draft, and tryout templates", () => {
    for (const change of [{ visibility: "paid" }, { category: "premium" }, { status: "draft" }, { selectionRules: { ...template.selectionRules, assessmentType: "tryout" } }] as const) {
      expect(getAuthorizedFreeQuestionIds({ ...input, template: { ...template, ...change } })).toEqual([]);
    }
  });
  test("rejects mixed and missing chapter scope", () => {
    expect(getAuthorizedFreeQuestionIds({ ...input, template: { ...template, selectionRules: { ...template.selectionRules, chapterIds: ["bab-1", "bab-2"] } } })).toEqual([]);
    expect(getAuthorizedFreeQuestionIds({ ...input, coverage: [] })).toEqual([]);
    expect(getAuthorizedFreeQuestionIds({ ...input, coverage: ["bab-1", "bab-2"] })).toEqual([]);
    expect(getAuthorizedFreeQuestionIds({ ...input, items: [items[0], { ...items[1], chapterId: null }] })).toEqual([]);
  });
  test("rejects unmapped, stale, or foreign questions and rules without fixed IDs", () => {
    expect(getAuthorizedFreeQuestionIds({ ...input, items: [items[0]] })).toEqual([]);
    expect(getAuthorizedFreeQuestionIds({ ...input, items: [items[0], { ...items[1], questionId: "other" }] })).toEqual([]);
    expect(getAuthorizedFreeQuestionIds({ ...input, items: [items[0], { ...items[1], contentVersion: 2 }] })).toEqual([]);
    expect(getAuthorizedFreeQuestionIds({ ...input, items: [items[0], { ...items[1], courseId: "other" }] })).toEqual([]);
    expect(getAuthorizedFreeQuestionIds({ ...input, template: { ...template, selectionRules: { chapterIds: ["bab-1"] } } })).toEqual([]);
  });
});
