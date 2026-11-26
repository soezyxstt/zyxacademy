import { beforeEach, describe, expect, mock, test } from "bun:test";
import { externalVideoPath, learningApi, learningRequestPath, learningRouteViews, liveHostPattern } from "@/packages/native-parity/student/learning/contracts";
import { createLearningFixtureRequest, learningFixtureCases } from "@/packages/native-parity/student/learning/fixtures";

const sessionGuard = mock(async (_request: Request): Promise<{ userId: string } | Response> => ({ userId: "student-a" }));
const courseRead = mock(async (_courseId: string) => ({ title: "Calculation", legacyId: "calculus" }));
const accessRead = mock(async (_context: { courseId: string; userId: string }) => ({ hasCourseAccess: true, hasFullContentAccess: true }));
const flashcardAccess = mock(async (_userId: string, _courseId: string) => ({ policy: { capabilities: { canReviewFlashcard: true } } }));
const conceptRead = mock(async (_id: string, _slug: string, _student: string) => null);
const reviewQueue = mock(async (_userId: string, _courseId: string) => []);
const submitReview = mock(async (..._arguments: unknown[]) => ({ nextReviewDue: new Date("2026-07-23T10:00Z"), nextIntervalDays: 3, nextBox: 2 }));
const videosRead = mock(async (..._arguments: unknown[]) => ({ hasFullContentAccess: true, chapters: [], playlists: [] }));
const pkaRead = mock(async (_input: unknown) => null);
const announceRead = mock(async (_userId: string, _announcementId: string) => "ok");
const revalidate = mock((_path: string) => {});

mock.module("@/app/api/native/student/_session", () => ({ requireNativeStudent: sessionGuard }));
mock.module("@/lib/course-utils", () => ({ getCourse: courseRead, getStudentCourseAccess: flashcardAccess }));
mock.module("@/lib/student/course-access", () => ({ resolveCourseAccess: accessRead }));
mock.module("@/lib/concept-explorer-service", () => ({ getConceptExplorerData: conceptRead }));
mock.module("@/lib/flashcard-actions", () => ({ getReviewQueue: reviewQueue, submitReview }));
mock.module("@/app/actions/video-actions", () => ({ getCourseVideosData: videosRead }));
mock.module("@/lib/learning-analytics", () => ({ getCourseLearningSummary: mock() }));
mock.module("@/lib/student/idea-mastery-read", () => ({ getStudentIdeaMasteryReadModel: mock() }));
mock.module("@/lib/student/legacy-mastery-read", () => ({ getLegacyMasteryReadModel: mock() }));
mock.module("@/lib/student/native-pka-learning", () => ({ readNativePkaLearning: pkaRead, acknowledgeNativePkaAnnouncement: announceRead }));
mock.module("@/lib/env", () => ({ env: { FEATURE_LIVE: "1", NEXT_PUBLIC_REALTIME_URL: "https://realtime.example" } }));
mock.module("next/cache", () => ({ revalidatePath: revalidate }));

const { GET, POST } = await import("@/app/api/native/student/learning/route");
const request = (query: string, body?: unknown) => new Request(`https://student.example${learningApi}${query}`,
  body ? { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : undefined);

beforeEach(() => {
  for (const spy of [sessionGuard, courseRead, accessRead, flashcardAccess, conceptRead, reviewQueue, submitReview, videosRead, pkaRead, announceRead, revalidate]) spy.mockClear();
});

describe("native student learning HTTPS boundary", () => {
  test("short-circuits current-account and role failures before reads or writes", async () => {
    sessionGuard.mockResolvedValueOnce(Response.json({ error: "ACCOUNT_CHANGED" }, { status: 409 }));
    expect((await GET(request("?view=concept&courseId=calc&slug=limit"))).status).toBe(409);
    expect(courseRead).not.toHaveBeenCalled();
    sessionGuard.mockResolvedValueOnce(Response.json({ error: "STUDENT_REQUIRED" }, { status: 403 }));
    expect((await POST(request("", { action: "pka-announcement-read", announcementId: "ann" }))).status).toBe(403);
    expect(announceRead).not.toHaveBeenCalled();
  });

  test("validates duplicate parameters, scoped locators, and PKA stage before reading", async () => {
    for (const url of ["?view=path&view=video&courseId=calc", "?view=concept&courseId=calc", "?view=concept&courseId=calc&slug=%2Fhidden",
      "?view=pka-stage&subject=matematika&stage=4", "?view=pka-stage&subject=secret&stage=1", "?view=progress&courseId=calc&studentId=student-b"]) {
      expect((await GET(request(url))).status).toBe(400);
    }
    expect(courseRead).not.toHaveBeenCalled();
    expect(pkaRead).not.toHaveBeenCalled();
    const forged = await POST(request("", { action: "flashcard-review", courseId: "calc", flashcardId: "card", grade: 3,
      isExamMode: false, studentId: "student-b" }));
    expect(forged.status).toBe(400);
    expect(submitReview).not.toHaveBeenCalled();
  });

  test("returns lock state without reading a concept or flashcard queue after entitlement loss", async () => {
    accessRead.mockResolvedValueOnce({ hasCourseAccess: true, hasFullContentAccess: false });
    const concept = await GET(request("?view=concept&courseId=calc&slug=limit"));
    expect(await concept.json()).toEqual({ view: "concept", state: "locked", courseTitle: "Calculation" });
    expect(concept.headers.get("cache-control")).toBe("private, no-store");
    expect(conceptRead).not.toHaveBeenCalled();

    flashcardAccess.mockResolvedValueOnce({ policy: { capabilities: { canReviewFlashcard: false } } });
    const flashcards = await GET(request("?view=flashcard&courseId=calc"));
    expect(await flashcards.json()).toEqual({ view: "flashcard", state: "locked", courseTitle: "Calculation" });
    expect(reviewQueue).not.toHaveBeenCalled();
  });

  test("submits the web review operation with session identity, exam fields and the expected course", async () => {
    const result = await POST(request("", { action: "flashcard-review", courseId: "math", flashcardId: "card", grade: 3, manualAnswer: "left and right", isExamMode: true }));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ nextReviewDue: "2026-07-23T10:00:00.000Z", nextIntervalDays: 3, nextBox: 2 });
    expect(submitReview).toHaveBeenCalledWith("student-a", "card", 3, "left and right", true, "math");
    expect(revalidate).toHaveBeenCalledWith("/courses/math/flashcard");
    submitReview.mockRejectedValueOnce(new Error("FLASHCARD_ACCESS_DENIED"));
    expect((await POST(request("", { action: "flashcard-review", courseId: "math", flashcardId: "other-card", grade: 3, isExamMode: false }))).status).toBe(403);
  });

  test("passes only serialized stage locators to PKA and avoids pre-minting video playback URLs", async () => {
    expect((await GET(request("?view=pka-stage&subject=fisika&stage=2&attemptId=own-attempt"))).status).toBe(404);
    expect(pkaRead).toHaveBeenCalledWith({ view: "pka-stage", userId: "student-a", courseTitle: "Calculation", stage: { subject: "fisika", number: 2, attemptId: "own-attempt" } });
    expect((await GET(request("?view=video&courseId=calc"))).status).toBe(200);
    expect(videosRead).toHaveBeenCalledWith("calc", { includePlayback: false });
  });
});

describe("native student learning fixtures", () => {
  test("defines three deterministic cases for each owned route, including PKA aliases and live host", () => {
    const patterns = Object.keys(learningRouteViews).concat(liveHostPattern);
    expect(patterns).toHaveLength(17);
    expect(new Set(learningFixtureCases.map((item) => item.id)).size).toBe(51);
    for (const pattern of patterns) expect(learningFixtureCases.filter((item) => item.pattern === pattern)).toHaveLength(3);
  });

  test("PKA gates aliases, preserves stage, and returns only owned attempt metadata", async () => {
    const enrolled = createLearningFixtureRequest();
    const denied = createLearningFixtureRequest("revoked");
    const alias = learningRequestPath("pka-material", { materialId: "nested" }, {});
    expect(await (await enrolled(alias)).json()).toMatchObject({ view: "pka-material", state: "ready" });
    expect(await (await denied(alias)).json()).toMatchObject({ state: "redirect", path: "/courses/tutorial-pka/daftar" });
    const ready = learningRequestPath("pka-stage", { subject: "matematika", stage: "1" }, { attemptId: "pka-attempt-complete" });
    expect(await (await enrolled(ready)).json()).toMatchObject({ stage: { stage: 1 }, attempt: { status: "completed", score: 75 } });
    const other = ready.replace("pka-attempt-complete", "another-account-attempt");
    expect((await enrolled(other)).status).toBe(404);
  });

  test("binds fixture mutations to one transport and recovers a failed request without stale data", async () => {
    const flashcardPath = learningRequestPath("flashcard", { id: "calculus" }, {});
    const offline = createLearningFixtureRequest("offline");
    await expect(offline(flashcardPath)).rejects.toThrow("Network request failed");
    expect((await offline(flashcardPath)).status).toBe(200);
    const current = createLearningFixtureRequest();
    const independent = createLearningFixtureRequest();
    await current(learningApi, { method: "POST", body: JSON.stringify({ action: "flashcard-review", flashcardId: "card-1", grade: 3 }) });
    expect((await (await current(flashcardPath)).json()).cards).toHaveLength(1);
    expect((await (await independent(flashcardPath)).json()).cards).toHaveLength(2);
  });
});

test("normalizes authorized YouTube playback locators without rewriting a signed storage URL", () => {
  expect(externalVideoPath("youtube/QvmF7d8V9_A")).toBe("https://www.youtube.com/watch?v=QvmF7d8V9_A");
  expect(externalVideoPath("youtube/https://other.test")).toBeNull();
  const direct = "https://storage.test/asset.mp4?signature=a%3Db";
  expect(externalVideoPath(direct)).toBe(direct);
});
