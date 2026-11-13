import { expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

let role: "student" | "admin" | null = "student";
const indexed = [
  { id: "material_allowed", entityType: "material", entityId: "allowed", courseId: "course", minRole: 1 },
  { id: "material_private", entityType: "material", entityId: "private", courseId: "course", minRole: 1 },
  { id: "chapter_foreign", entityType: "chapter", entityId: "foreign", courseId: "course", minRole: 1 },
];
const matches = ["allowed", "private", "foreign", "deleted"].map((id) => ({
  id: `${id === "foreign" ? "chapter" : "material"}_${id}`,
  score: 1,
  metadata: { title: `STALE ${id}`, href: `/courses/course/material/${id}`, category: "material", entity_type: "material", entity_id: id, course_id: "course", min_role: 1, snippet: "SECRET" },
}));
mock.module("@/db", () => ({ db: { select: () => ({ from: () => ({ where: async () => indexed }) }) } }));
mock.module("next/headers", () => ({ headers: async () => new Headers() }));
mock.module("@/lib/auth", () => ({ auth: { api: { getSession: async () => role ? { user: { id: "student", role } } : null } } }));
mock.module("@/lib/auth/authorization", () => ({ getPeranCodes: async () => [] }));
mock.module("@/lib/search/service", () => ({ embedSearchQuery: async () => [], querySearchVectors: async () => ({ matches }) }));
mock.module("@/lib/search/student-course-results", () => ({ resolveStudentSearchCandidates: async (_user: string, candidates: Array<{ entityId: string }>) => new Map(candidates.filter((item) => item.entityId === "allowed").map((item) => [item, "Current title"])) }));
const { GET } = await import("@/app/api/search/route");

test("student search drops stale and foreign results and replaces index metadata", async () => {
  role = "student";
  const response = await GET(new NextRequest("http://localhost/api/search?q=test&limit=4"));
  const data = await response.json();
  expect(response.status).toBe(200);
  expect(data.total).toBe(1);
  expect(JSON.stringify(data)).toContain("Current title");
  expect(JSON.stringify(data)).not.toMatch(/STALE|SECRET|private|foreign|deleted/);
});

test("admin search retains scoped index results", async () => {
  role = "admin";
  const data = await (await GET(new NextRequest("http://localhost/api/search?q=test&limit=4"))).json();
  expect(data.total).toBe(4);
});

test("public search continues to reject non-marketing paths", async () => {
  role = null;
  const data = await (await GET(new NextRequest("http://localhost/api/search?q=test&limit=4"))).json();
  expect(data.total).toBe(0);
});
