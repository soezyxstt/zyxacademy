import { beforeEach, describe, expect, test, mock } from "bun:test";
import { NextRequest } from "next/server";

let userId: string | null = "bob";
let reads = 0;
mock.module("@/lib/auth", () => ({ auth: { api: { getSession: async () => userId ? { user: { id: userId } } : null } } }));
mock.module("next/headers", () => ({ headers: async () => new Headers() }));
mock.module("@/db", () => ({ db: { select: () => { reads++; return { from: () => ({ where: () => ({ limit: async () => [] }) }) }; } } }));
mock.module("@/lib/pemahaman/evidence", () => ({ recordLearningEvidence: async () => {} }));
mock.module("@/lib/gamification/learning-start", () => ({ startLearningRewards: async () => {} }));
mock.module("@/lib/gamification/receipts", () => ({ recordGamificationEvidence: async () => {} }));
mock.module("@/lib/student/course-access", () => ({ resolveCourseAccess: async () => ({}) }));
mock.module("@/lib/course-utils", () => ({ getStudentCourseAccess: async () => null, isFreeChapterScoped: () => false }));
const { PUT } = await import("@/app/api/student/articles/[articleId]/progress/route");

function request(expected?: string) {
  return new NextRequest("http://localhost/api/student/articles/a/progress", {
    method: "PUT", headers: { "Content-Type": "application/json", ...(expected ? { "x-student-id": expected } : {}) },
    body: JSON.stringify({ sectionId: "s", percent: 20, timeSpentSeconds: 5 }),
  });
}
beforeEach(() => { reads = 0; userId = "bob"; });
describe("article progress account fence", () => {
  test("rejects a queued previous-account write before reading or writing progress", async () => {
    const response = await PUT(request("alice"), { params: Promise.resolve({ articleId: "a" }) });
    expect(response.status).toBe(403); expect(reads).toBe(0);
  });
  test("a matching header still requires an authenticated session", async () => {
    userId = null;
    const response = await PUT(request("bob"), { params: Promise.resolve({ articleId: "a" }) });
    expect(response.status).toBe(401); expect(reads).toBe(0);
  });
  test("matching and legacy requests continue to authoritative article lookup", async () => {
    for (const expected of ["bob", undefined]) {
      const response = await PUT(request(expected), { params: Promise.resolve({ articleId: "a" }) });
      expect(response.status).toBe(404);
    }
    expect(reads).toBe(2);
  });
});
