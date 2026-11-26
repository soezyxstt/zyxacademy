import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { matchStudentRoute, studentMaterialReaderTarget, studentPatterns } from "../../../apps/mobile-native/features/student/routes";
import type { MaterialDetailData } from "./courses/contract";

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

test("an authorized PDF hands off to the guarded web material route for the same document", () => {
  const route = matchStudentRoute("/courses/math/material/manual%201?section=Exercise%201&page=3&target=https://foreign.example");
  if (!route) throw new Error("Expected a Student reading route");
  const data: MaterialDetailData = {
    view: "material-detail",
    course: { id: "math", title: "Math", category: "", description: "", hasFullContentAccess: true },
    material: { id: "manual 1", title: "Manual", group: "pdf", kind: "pdf", completed: false, locked: false },
  };
  expect(studentMaterialReaderTarget(route, data)).toEqual({
    kind: "pdf", courseId: "math", materialId: "manual 1", section: "Exercise 1", page: 3,
    webPath: "/courses/math/material/manual%201?section=Exercise%201&page=3",
  });
  expect(studentMaterialReaderTarget(route, { ...data, material: { ...data.material, locked: true } })).toBeNull();
  expect(studentMaterialReaderTarget(route, { ...data, material: { ...data.material, id: "another" } })).toBeNull();
  expect(studentMaterialReaderTarget(route, { ...data, material: { ...data.material, kind: "article", group: "materi" } })).toEqual({
    kind: "article", courseId: "math", materialId: "manual 1", section: "Exercise 1", page: 3,
  });
});
