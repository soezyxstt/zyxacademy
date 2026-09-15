import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const actionSource = readFileSync("app/actions/tutor-extra.ts", "utf8");

describe("Zyra learning action access contract", () => {
  test("gates tutor-side KO assets before direct asset queries", () => {
    expect(actionSource).toContain("auth.api.getSession");
    expect(actionSource).toContain("resolveCourseAccess");
    expect(actionSource).toContain("canAccessCourseContent");

    for (const actionName of ["getFlashcardsForKOAction", "getQuestionsForKOAction"]) {
      const actionStart = actionSource.indexOf(`export async function ${actionName}`);
      const gate = actionSource.indexOf("const access = await resolveKnowledgeObjectAccess(koId)", actionStart);
      const query = actionSource.indexOf("const list = await db", gate);
      expect(actionStart).toBeGreaterThanOrEqual(0);
      expect(gate).toBeGreaterThan(actionStart);
      expect(query).toBeGreaterThan(gate);
    }

    expect(actionSource).toContain('access.tier === "free"');
    expect(actionSource).toContain('canAccessCourseContent(access, "flashcard", [knowledgeObject.chapterId])');
  });
});
