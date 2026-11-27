import { beforeEach, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import { PgDialect } from "drizzle-orm/pg-core";
import { artikel, kemajuanBacaArtikel } from "@/db/schema";

let userId: string | null = "student";
let allowAccess = true;
let version = 3;
let reads: Array<{ table: unknown; params: unknown[] }> = [];
let reviewCalls: unknown[][] = [];
let materialWrites: unknown[] = [];
const dialect = new PgDialect();

mock.module("next/headers", () => ({ headers: async () => new Headers() }));
mock.module("next/cache", () => ({ revalidatePath: () => {} }));
mock.module("@/lib/auth", () => ({ auth: { api: { getSession: async () => userId ? { user: { id: userId } } : null } } }));
mock.module("@/lib/course-utils", () => ({
  getStudentCourseAccess: async () => allowAccess ? { tier: "standard", hasFullContentAccess: true, policy: { scopedChapterIds: [] }, freeChapterIds: [] } : null,
  isFreeChapterScoped: () => false,
}));
mock.module("@/lib/pemahaman/evidence", () => ({ recordLearningEvidence: async () => {} }));
mock.module("@/lib/gamification/learning-start", () => ({ startLearningRewards: async () => null }));
mock.module("@/lib/gamification/receipts", () => ({ recordGamificationEvidence: async () => {} }));
mock.module("@/lib/student/course-access", () => ({ resolveCourseAccess: async () => null }));
mock.module("@/lib/flashcard-actions", () => ({
  submitReview: async (...args: unknown[]) => {
    reviewCalls.push(args);
    return { nextReviewDue: new Date("2026-11-19T00:00:00Z"), nextIntervalDays: 1, nextBox: 1 };
  },
}));
mock.module("@/lib/material-progress.repository", () => ({ updateMaterialProgress: async (input: unknown) => { materialWrites.push(input); return input; } }));
mock.module("@/lib/tutor-rag", () => ({ summarizeChapterCached: async () => { throw new Error("Unexpected provider call"); } }));
mock.module("@/db", () => ({ db: {
  select: () => ({ from: (table: unknown) => ({ where: (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
    reads.push({ table, params: dialect.sqlToQuery(condition).params });
    const rows = table === artikel
      ? [{ id: "article", version, courseId: "course", chapterId: "chapter" }]
      : table === kemajuanBacaArtikel
        ? [{ sectionId: "section", maxReadPercent: 95, completedAt: new Date("2026-11-18T00:00:00Z"), timeSpentSeconds: 14, lastReadAt: new Date("2026-11-18T01:00:00Z") }]
        : [];
    const result = Object.assign(Promise.resolve(rows), {
      limit: async () => rows,
      orderBy: () => Object.assign(Promise.resolve(rows), { limit: async () => rows }),
    });
    return result;
  } }) }),
  transaction: async () => { throw new Error("Unexpected write"); },
} }));

const { GET, PUT } = await import("@/app/api/student/articles/[articleId]/progress/route");
const { submitReviewAction } = await import("@/app/(student)/courses/[id]/flashcard/actions");
const { POST: materialProgress } = await import("@/app/api/student/material-progress/route");
const { POST: summarizeChapter } = await import("@/app/api/student/summarize-chapter/route");
const context = () => ({ params: Promise.resolve({ articleId: "article" }) });

beforeEach(() => {
  userId = "student";
  allowAccess = true;
  version = 3;
  reads = [];
  reviewCalls = [];
  materialWrites = [];
});

test("anonymous and changed accounts cannot read or write progress", async () => {
  for (const method of [GET, PUT]) {
    userId = null;
    expect((await method(new NextRequest("https://local.test/api/student/articles/article/progress?version=3"), context())).status).toBe(401);
    userId = "other-student";
    expect((await method(new NextRequest("https://local.test/api/student/articles/article/progress?version=3", { headers: { "x-student-id": "student" } }), context())).status).toBe(409);
  }
  expect(reads).toEqual([]);
});

test("GET reads only the authenticated user's requested published version", async () => {
  const response = await GET(new NextRequest("https://local.test/api/student/articles/article/progress?version=3", { headers: { "x-student-id": "student" } }), context());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ articleId: "article", articleVersion: 3, sectionProgress: {
    section: { maxReadPercent: 95, completed: true, timeSpentSeconds: 14, lastReadAt: "2026-11-18T01:00:00.000Z" },
  } });
  expect(reads.find((read) => read.table === kemajuanBacaArtikel)?.params).toEqual(["student", "article", 3]);
});

test("revoked course access blocks progress reads", async () => {
  allowAccess = false;
  const response = await GET(new NextRequest("https://local.test/api/student/articles/article/progress?version=3"), context());
  expect(response.status).toBe(403);
  expect(reads.some((read) => read.table === kemajuanBacaArtikel)).toBe(false);
});

test("an old article revision cannot read new progress or write elapsed time to it", async () => {
  const read = await GET(new NextRequest("https://local.test/api/student/articles/article/progress?version=2"), context());
  expect(read.status).toBe(409);
  const write = await PUT(new NextRequest("https://local.test/api/student/articles/article/progress", {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sectionId: "section", articleVersion: 2, percent: 100, timeSpentSeconds: 20, completed: true }),
  }), context());
  expect(write.status).toBe(409);
  expect(reads.some((read) => read.table === kemajuanBacaArtikel)).toBe(false);
});

test("invalid GET versions fail before reading article data", async () => {
  for (const suffix of ["", "?version=-1", "?version=1.5", "?version=invalid"]) {
    expect((await GET(new NextRequest(`https://local.test/api/student/articles/article/progress${suffix}`), context())).status).toBe(400);
  }
  expect(reads).toEqual([]);
});

test("flashcard reviews reject an old actor and preserve the existing exam input", async () => {
  await expect(submitReviewAction("old-student", "card", 3, "x = 2", true, "course")).rejects.toThrow("Account changed");
  expect(reviewCalls).toEqual([]);
  await submitReviewAction("student", "card", 3, "x = 2", true, "course");
  expect(reviewCalls).toEqual([["student", "card", 3, "x = 2", true]]);
});

test("material progress and chapter summary reject a changed account before effects", async () => {
  const request = () => new NextRequest("https://local.test/api/student/material-progress", { method: "POST", headers: { "x-student-id": "old-student" } });
  expect((await materialProgress(request())).status).toBe(409);
  expect((await summarizeChapter(request())).status).toBe(409);
  expect(materialWrites).toEqual([]);
  expect(reads).toEqual([]);
});

test("material progress preserves the authenticated actor and exact elapsed delta", async () => {
  const result = await materialProgress(new NextRequest("https://local.test/api/student/material-progress", {
    method: "POST", headers: { "Content-Type": "application/json", "x-student-id": "student" },
    body: JSON.stringify({ materialId: "material", completionPercent: 30, lastSectionId: "section", lastPosition: { type: "article", section: "2" }, timeSpentSeconds: 20 }),
  }));
  expect(result.status).toBe(200);
  expect(materialWrites).toEqual([{ studentId: "student", materialId: "material", completionPercent: 30, lastSectionId: "section", lastPosition: { type: "article", section: "2" }, timeSpentSeconds: 20 }]);
});
