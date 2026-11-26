import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import { matchAcademicRoute } from "./match";
import { academicRoutes } from "./routes";

test("every owned web route dispatches to its own native pattern", () => {
  const owned = readFileSync(new URL("../../../plans/native-parallel/routes.tsv", import.meta.url), "utf8")
    .split("\n").filter(row => row.startsWith("academic\t"))
    .map(row => row.split("\t")[1].slice(3, -9).replace(/\/\([^/]+\)/g, ""));
  assert.equal(owned.length, 54);
  assert.deepEqual(academicRoutes.map(([pattern]) => pattern).sort(), owned.sort());
  for (const pattern of owned) {
    assert.equal(matchAcademicRoute(pattern.replace(/\[[^\]]+\]/g, "sample"))?.pattern, pattern);
  }
});

test("static paths win, IDs and slugs stay distinct, malformed or foreign paths fail closed", () => {
  assert.deepEqual(matchAcademicRoute("/tutor/schedule")?.params, {});
  assert.deepEqual(matchAcademicRoute("/tutor/id%201")?.params, { courseId: "id 1" });
  assert.deepEqual(matchAcademicRoute("/admin/courses/biologi-dasar?tab=materials")?.query, { tab: "materials" });
  assert.deepEqual(matchAcademicRoute("/admin/courses/biologi-dasar")?.params, { slug: "biologi-dasar" });
  for (const href of ["//example.org", "/admin/quizzes", "/tutor/%2F", "/tutor/%XX", "/admin/courses/.."]) {
    assert.equal(matchAcademicRoute(href), null);
  }
});
