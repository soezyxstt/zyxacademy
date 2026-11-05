import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { demoSelectionHref, parseDemoSelection } from "@/lib/demo/selection";

describe("demo product selection", () => {
  test("rejects repeated, empty, padded and invalid selection parameters", () => {
    for (const params of [{ course: ["a", "b"] }, { articleId: "" }, { diktatId: " x " }, { quizOffset: "-1" }, { flashcardOffset: "1.5" }, { collectionOffset: "9007199254740992" }, { quizOffset: ["0", "3"] }]) {
      expect(parseDemoSelection(params)).toBeNull();
    }
    expect(parseDemoSelection({ course: "c", articleId: "a", quizOffset: "3" })).toEqual({ course: "c", selection: { articleId: "a", quizOffset: 3 } });
  });
  test("retains course and independent selections while resetting the changed set's page", () => {
    const url = demoSelectionHref("/en/demo/flashcards?course=c", { articleId: "article", flashcardSetId: "old", flashcardOffset: 100, quizOffset: 3 }, { flashcardSetId: "new", flashcardOffset: null });
    const parsed = new URL(url, "https://example.test");
    expect(parsed.pathname).toBe("/en/demo/flashcards");
    expect(Object.fromEntries(parsed.searchParams)).toEqual({ course: "c", articleId: "article", flashcardSetId: "new", quizOffset: "3" });
  });
  test("both routes reject foreign selection when the scoped resolver returns null", () => {
    for (const path of ["app/(marketing)/demo/page.tsx", "app/(marketing)/demo/[view]/page.tsx"]) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("selection={parsed.selection}");
      expect(source).toContain("getDemoExperience(courseId, selection)");
      expect(source).toContain("if (!experience) notFound()");
    }
  });
});
