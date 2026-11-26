import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { matchStudentRoute, studentPatterns } from "../../../apps/mobile-native/features/student/routes";

test("the native registry matches every owned Student route exactly once", () => {
  const rows = readFileSync(new URL("../../../plans/native-parallel/routes.tsv", import.meta.url), "utf8")
    .split("\n").filter(line => line.startsWith("student\t"))
    .map(line => line.trim().slice("student\tapp/(student)".length, -"/page.tsx".length));
  expect(rows.length).toBe(50);
  expect(Object.values(studentPatterns).flat().sort()).toEqual(rows.sort());
  for (const pattern of rows) {
    const path = pattern.replace(/\[([^\]]+)\]/g, "test-$1");
    expect(matchStudentRoute(path)?.pattern).toBe(pattern);
  }
});

test("static Tutorial PKA routes win and dynamic links retain their query", () => {
  expect(matchStudentRoute("/courses/tutorial-pka/material")?.area).toBe("learning");
  expect(matchStudentRoute("/courses/fisika/quiz/latihan%201?tab=review")).toMatchObject({
    params: { id: "fisika", quizId: "latihan 1" }, query: { tab: "review" },
  });
});

test("invalid segments and foreign destinations never reach Student screens", () => {
  for (const path of ["//example.org", "/courses/%2Foutside", "/courses/%", "/courses/%2e%2e", "/admin", "https://example.org/courses"]) {
    expect(matchStudentRoute(path)).toBeNull();
  }
});
