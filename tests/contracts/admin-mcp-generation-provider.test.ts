import { afterAll, afterEach, beforeAll, beforeEach, expect, mock, test } from "bun:test";
import * as schema from "@/db/schema";
import { createPostgresTestDb } from "../helpers/postgres";

const { client, testDb } = await createPostgresTestDb();
mock.module("@/lib/db", () => ({ db: testDb }));
mock.module("@/db", () => ({ db: testDb }));
const startGenerationJob = mock(async (_input: Record<string, unknown>) => "generation-result");
mock.module("@/lib/generation-pipeline", () => ({ startGenerationJob }));
const { executeAdminOperation, generationSnapshot } = await import("@/lib/admin-mcp/external-executor");

const providerKeys = [
  "QUEUE_PROVIDER", "INNGEST_EVENT_KEY", "STORAGE_PROVIDER_MODE", "R2_ENDPOINT", "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "AWS_ENDPOINT_URL_S3", "AWS_REGION", "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY", "NEON_STORAGE_BUCKET", "FIREBASE_SERVICE_ACCOUNT_JSON", "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN",
];
let previous: Record<string, string | undefined>;
beforeEach(() => {
  previous = Object.fromEntries(providerKeys.map(key => [key, process.env[key]]));
  for (const key of providerKeys) delete process.env[key];
  startGenerationJob.mockReset();
  startGenerationJob.mockResolvedValue("generation-result");
});
afterEach(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
beforeAll(async () => {
  await testDb.insert(schema.user).values({ id: "author", name: "Author", email: "generation@example.test" });
  await testDb.insert(schema.courses).values({ id: "course", title: "Course", category: "Matematika" });
  await testDb.insert(schema.chapters).values({ id: "chapter", courseId: "course", title: "Chapter", orderIndex: 0 });
  await testDb.insert(schema.masterTeachingDocuments).values({ id: "mtd", courseId: "course", title: "Source", markdownContent: "Source", createdById: "author" });
  await testDb.insert(schema.concepts).values({ id: "concept", canonicalSlug: "concept" });
  await testDb.insert(schema.knowledgeObjects).values({
    id: "ko", courseId: "course", chapterId: "chapter", mtdId: "mtd", conceptId: "concept",
    learningOrder: 1, title: "Concept", conceptName: "Concept", content: "Content", type: "definition", bloomLevel: "remember",
  });
});
afterAll(() => client.close());

async function generationJob(): Promise<typeof schema.adminOperationJobs.$inferSelect> {
  const scope = { courseId: "course", chapterId: "chapter", koId: "ko" };
  const snapshot = await generationSnapshot(scope);
  return {
    id: "admin-generation", actorId: "author", sessionId: "session", kind: "generation_start",
    requiredScope: "jobs:write", environment: "http://localhost:3000", status: "running",
    payload: { ...scope, expectedDataRevision: snapshot.dataRevision }, result: null, errorCode: null,
    createdAt: new Date(), updatedAt: new Date(),
  };
}

test("Cloud Tasks generation reaches the existing pipeline without an Inngest key", async () => {
  process.env.QUEUE_PROVIDER = "cloud-tasks";
  expect(await executeAdminOperation(await generationJob())).toEqual({ jobId: "generation-result", targetCount: 1 });
  expect(startGenerationJob).toHaveBeenCalledTimes(1);
  expect(startGenerationJob).toHaveBeenCalledWith({ courseId: "course", chapterId: "chapter", koId: "ko", tutorId: "author", targetCount: 1 });
});

test.each(["inngest", undefined])("legacy or default queue %s rejects a missing Inngest key before dispatch", async provider => {
  if (provider !== undefined) process.env.QUEUE_PROVIDER = provider;
  await expect(executeAdminOperation(await generationJob())).rejects.toThrow("PROVIDER_NOT_CONFIGURED");
  expect(startGenerationJob).not.toHaveBeenCalled();
});

test("legacy Inngest generation still dispatches with its key", async () => {
  process.env.QUEUE_PROVIDER = "inngest";
  process.env.INNGEST_EVENT_KEY = "local-test-key";
  expect(await executeAdminOperation(await generationJob())).toEqual({ jobId: "generation-result", targetCount: 1 });
  expect(startGenerationJob).toHaveBeenCalledTimes(1);
});

test("Cloud Tasks generation preserves the selected adapter's failure", async () => {
  process.env.QUEUE_PROVIDER = "cloud-tasks";
  const failure = new Error("QUEUE_ENVIRONMENT_REQUIRED");
  startGenerationJob.mockRejectedValueOnce(failure);
  await expect(executeAdminOperation(await generationJob())).rejects.toBe(failure);
  expect(startGenerationJob).toHaveBeenCalledTimes(1);
});

test("Cloud Tasks generation still rejects a changed source snapshot before dispatch", async () => {
  process.env.QUEUE_PROVIDER = "cloud-tasks";
  const job = await generationJob();
  job.payload.expectedDataRevision = "0".repeat(64);
  await expect(executeAdminOperation(job)).rejects.toThrow("REVISION_CONFLICT");
  expect(startGenerationJob).not.toHaveBeenCalled();
});

test("Cloud Tasks selection retains the other providers' credential preflights", async () => {
  process.env.QUEUE_PROVIDER = "cloud-tasks";
  const job = await generationJob();
  for (const kind of ["notification_send", "form_sheet", "meet_create", "meet_end", "media_upload"] as const) {
    await expect(executeAdminOperation({ ...job, kind })).rejects.toThrow("PROVIDER_NOT_CONFIGURED");
  }
  process.env.STORAGE_PROVIDER_MODE = "neon";
  await expect(executeAdminOperation({ ...job, kind: "media_upload" })).rejects.toThrow("PROVIDER_NOT_CONFIGURED");
  expect(startGenerationJob).not.toHaveBeenCalled();
});
