import { expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as schema from "@/db/schema";

const quizRows = [
  { id: "search-wide", courseId: "search-course", title: "Current quiz", status: "published", category: "chapter", visibility: "paid", selectionRules: {} },
  { id: "search-preview", courseId: "search-course", title: "Preview quiz", status: "published", category: "chapter", visibility: "free", selectionRules: { chapterId: "first" } },
  { id: "search-invalid", courseId: "search-course", title: "Invalid quiz", status: "published", category: "chapter", visibility: "free", selectionRules: "null" },
];
const examRows = [
  { id: "search-exam", courseId: "search-course", title: "Current tryout", type: "tryout", status: "published" },
  { id: "search-draft", courseId: "search-course", title: "Draft", type: "tryout", status: "draft" },
  { id: "search-foreign", courseId: "foreign", title: "Foreign", type: "tryout", status: "published" },
];
let full = true;
let paid = false;
mock.module("@/db", () => ({ db: { select: () => ({ from: (table: unknown) => ({ where: async () => table === schema.quizTemplates ? quizRows : table === schema.exams ? examRows : [] }) }) } }));
mock.module("@/lib/student/course-access", () => ({
  hasChapterScopeWithin: (ids: string[], allowed: string[]) => ids.length > 0 && ids.every((id) => allowed.includes(id)),
  canAccessCourseContent: () => false,
  resolveCourseAccessBatch: async (_user: string, courses: string[]) => new Map(courses.map((id) => [id, { hasCourseAccess: true, tier: paid ? "enrolled" : "free", hasFullContentAccess: full || paid, courseId: "search-course", canonicalCourseId: "search-canonical", legacyCourseId: "search-course", scopedChapterIds: ["first", "later"], freeChapterIds: ["first"] }])),
}));
mock.module("@/lib/course-utils", () => ({ isFreeQuizTemplate: (quiz: any, ids: string[]) => quiz.status === "published" && quiz.visibility === "free" && ids.includes(quiz.selectionRules?.chapterId) }));
const { resolveStudentSearchCandidates } = await import("@/lib/search/student-course-results");
const candidates = ["search-wide", "search-preview", "search-invalid", "search-exam", "search-draft", "search-foreign"].map((entityId) => ({ entityId, courseId: "search-course", type: entityId.includes("exam") || entityId.includes("draft") || entityId.includes("foreign") ? "exam" : "quiz" }));

test("search rehydrates only currently authorized quiz and tryout titles", async () => {
  full = true; paid = false;
  let result = await resolveStudentSearchCandidates("student", candidates);
  expect([...result.values()].sort()).toEqual(["Current quiz", "Current tryout", "Preview quiz"]);
  full = false;
  result = await resolveStudentSearchCandidates("student", candidates);
  expect([...result.values()]).toEqual(["Preview quiz"]);
  paid = true;
  result = await resolveStudentSearchCandidates("student", candidates);
  expect([...result.values()].sort()).toEqual(["Current quiz", "Current tryout", "Preview quiz"]);
  expect(readFileSync("app/api/search/route.ts", "utf8")).toContain('candidate.type === "exam" ? `/tryout/${encodeURIComponent(candidate.entityId)}`');
});
