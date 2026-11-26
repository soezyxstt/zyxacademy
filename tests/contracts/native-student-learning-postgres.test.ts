import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { createPostgresTestDb } from "../helpers/postgres";

let fixture: Awaited<ReturnType<typeof createPostgresTestDb>>;
const database = new Proxy({} as Awaited<ReturnType<typeof createPostgresTestDb>>["testDb"], {
  get(_target, key) {
    const value = Reflect.get(fixture.testDb, key);
    return typeof value === "function" ? value.bind(fixture.testDb) : value;
  },
});
mock.module("@/db", () => ({ db: database }));
const guard = mock(async (_request: Request): Promise<{ userId: string } | Response> => ({ userId: "learner" }));
mock.module("@/app/api/native/student/_session", () => ({ requireNativeStudent: guard }));
const secret = "native-live-test-secret";
mock.module("@/lib/env", () => ({ env: { FEATURE_LIVE: "1", NEXT_PUBLIC_REALTIME_URL: "https://live.test", LIVE_HMAC_SECRET: secret } }));
const access = mock(async (_input: unknown): Promise<{ hasCourseAccess: boolean; isEnrolled: boolean; canonicalCourseId: string | null; legacyCourseId: string | null }> => ({ hasCourseAccess: true, isEnrolled: true, canonicalCourseId: "canon-1", legacyCourseId: "legacy-1" }));
mock.module("@/lib/student/course-access", () => ({ resolveCourseAccess: access }));
mock.module("@/lib/pka-enrollment", () => ({
  isPkaEnrolled: async (userId: string) => Boolean((await database.select({ id: schema.enrollments.id }).from(schema.enrollments)
    .where(and(eq(schema.enrollments.courseId, "tutorial-pka"), eq(schema.enrollments.userId, userId))).limit(1))[0]),
}));
mock.module("@/lib/migrasi/repository-kompatibilitas", () => ({ dualWritePkaStageProgress: async () => {} }));

const { POST } = await import("@/app/api/native/student/learning/live/route");
const { isPkaStageAttemptAllowed, recordPkaStageResult } = await import("@/lib/pka-simulation");

beforeAll(async () => {
  fixture = await createPostgresTestDb();
  await database.insert(schema.user).values([
    { id: "learner", name: "Learner", email: "learner@example.test" },
    { id: "other", name: "Other learner", email: "other@example.test" },
  ]);
  await database.insert(schema.courses).values([
    { id: "legacy-1", title: "Intro", category: "Math" },
    { id: "legacy-2", title: "Advanced", category: "Math" },
    { id: "tutorial-pka", title: "PKA", category: "Math" },
  ]);
  await database.insert(schema.liveQuizSessions).values([
    { id: "room1", courseId: "legacy-1", tutorId: "other", code: "LIVE01", questionsSnapshot: [] },
    { id: "room2", courseId: "legacy-2", tutorId: "other", code: "LIVE02", questionsSnapshot: [] },
    { id: "room3", courseId: "legacy-1", tutorId: "other", code: "LIVE03", questionsSnapshot: [], state: "ended" },
  ]);
  await database.insert(schema.enrollments).values({ id: "pka-learner", userId: "learner", courseId: "tutorial-pka", expiresAt: new Date("2030-01-01T00:00Z") });
  const stages = [1, 2, 3];
  await database.insert(schema.quizTemplates).values(stages.map((stage) => ({ id: `quiz-${stage}`, title: `Stage ${stage}`, courseId: "tutorial-pka",
    category: "simulation", status: "published", selectionRules: {} })));
  await database.insert(schema.pkaSimulationStages).values(stages.map((stage) => ({ id: `stage-${stage}`, subject: "matematika", stage,
    quizTemplateId: `quiz-${stage}`, passScoreThreshold: 70 })));
}, 60_000);

afterAll(async () => { await fixture?.client.close(); });

describe("native live Student access", () => {
  const join = (code: string) => POST(new Request("https://student.example/api/native/student/learning/live", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, courseId: "canon-1" }),
  }));

  test("rechecks account, resource entitlement, and room on mint or reconnect", async () => {
    guard.mockResolvedValueOnce(Response.json({ error: "ACCOUNT_CHANGED" }, { status: 409 }));
    expect((await join("LIVE01")).status).toBe(409);
    access.mockResolvedValueOnce({ hasCourseAccess: true, isEnrolled: false, canonicalCourseId: "canon-1", legacyCourseId: "legacy-1" });
    expect((await join("LIVE01")).status).toBe(403);
    expect((await join("LIVE02")).status).toBe(404);
    expect((await join("LIVE03")).status).toBe(410);
  });

  test("continues joining a legacy-only room while its course remains active and enrolled", async () => {
    access.mockResolvedValueOnce({ hasCourseAccess: true, isEnrolled: true, canonicalCourseId: null, legacyCourseId: "legacy-1" });
    expect((await join("LIVE01")).status).toBe(200);
  });

  test("mints the existing short-lived worker token with the canonical course's room and bound identity", async () => {
    const startedAt = Date.now();
    const response = await join("live01");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const result = await response.json();
    const [payload, signature] = result.token.split(".");
    expect(signature).toBe(createHmac("sha256", secret).update(payload).digest("hex"));
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    expect(decoded).toMatchObject({ userId: "learner", name: "Learner", sessionId: "room1" });
    expect(decoded.exp).toBeGreaterThanOrEqual(startedAt + 60_000);
    expect(decoded.exp).toBeLessThanOrEqual(Date.now() + 60_000);
    expect(result.wsUrl).toBe("https://live.test/room/room1/websocket");
  });
});

test("generic PKA starts require registration and the persisted stage decision", async () => {
  expect(await isPkaStageAttemptAllowed("other", "ordinary-quiz")).toBeTrue();
  expect(await isPkaStageAttemptAllowed("other", "quiz-1")).toBeFalse();
  expect(await isPkaStageAttemptAllowed("learner", "quiz-1")).toBeTrue();
  expect(await isPkaStageAttemptAllowed("learner", "quiz-2")).toBeFalse();
  await database.insert(schema.studentQuizAttempts).values({ id: "first", studentId: "learner", templateId: "quiz-1", score: 75,
    questionsSnapshot: [], status: "completed" });
  await recordPkaStageResult("first");
  expect(await isPkaStageAttemptAllowed("learner", "quiz-1")).toBeTrue();
  expect(await isPkaStageAttemptAllowed("learner", "quiz-2")).toBeFalse();
  expect(await isPkaStageAttemptAllowed("learner", "quiz-3")).toBeFalse();
});
