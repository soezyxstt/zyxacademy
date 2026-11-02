import { afterEach, describe, expect, it } from "bun:test";
import { createPostgresTestDb } from "../helpers/postgres";
import * as schema from "@/db/schema";
import { createCodingAttemptRepository } from "@/lib/coding/repository";
import type { db as database } from "@/db";
import type { CodingEvaluation, CodingSubmissionRequest } from "@/lib/coding/contracts";
import { eq } from "drizzle-orm";
const clients: Awaited<ReturnType<typeof createPostgresTestDb>>["client"][] = [];
afterEach(async () => { for (const client of clients.splice(0)) await client.close(); });
async function setup() {
  const { client, testDb } = await createPostgresTestDb();
  clients.push(client);
  await testDb.insert(schema.user).values({ id: "student", name: "Student", email: "student@example.test" });
  await testDb.insert(schema.mataKuliah).values({ id: "course", code: "COURSE", title: "Course" });
  const db = testDb as unknown as typeof database;
  return { db, repository: createCodingAttemptRepository(db) };
}
const request: CodingSubmissionRequest = { requestId: "request-1", problem: { problemId: "problem", version: 1 }, code: "print(1)", stdin: "" };
const input = { learnerId: "student", courseId: "course", surface: "article" as const, surfaceId: "article:1", request, maxAttempts: null, deadlineMs: null };
const evaluation: CodingEvaluation = { problem: request.problem, authority: "trusted_server", verdict: "incorrect", cases: [] };
describe("durable coding attempts", () => {
  it("reserves once, rejects payload conflicts and replays the immutable completed result", async () => {
    const { repository } = await setup();
    const first = await repository.reserve(input);
    expect(first.created).toBe(true);
    expect((await repository.reserve(input)).created).toBe(false);
    const reordered = { stdin: request.stdin, code: request.code, problem: { version: 1, problemId: "problem" }, requestId: request.requestId };
    expect((await repository.reserve({ ...input, request: reordered })).created).toBe(false);
    await expect(repository.reserve({ ...input, request: { ...request, code: "different" } })).rejects.toThrow("REQUEST_CONFLICT");
    await repository.complete(first.attempt.id, evaluation);
    const replay = await repository.reserve(input);
    expect(replay.created).toBe(false);
    expect(replay.attempt.evaluation).toEqual(evaluation);
    expect((await repository.reserve({ ...input, request: { ...request, requestId: "request-2" } })).attempt.ordinal).toBe(2);
  });
  it("enforces server deadlines and attempt limits but permits completed result replay", async () => {
    const { repository } = await setup();
    await expect(repository.reserve({ ...input, deadlineMs: 1 })).rejects.toThrow("DEADLINE_PASSED");
    const first = await repository.reserve({ ...input, maxAttempts: 1 });
    await repository.complete(first.attempt.id, evaluation);
    await expect(repository.reserve({ ...input, maxAttempts: 1, request: { ...request, requestId: "second" } })).rejects.toThrow("ATTEMPT_LIMIT");
    expect((await repository.reserve({ ...input, deadlineMs: 1 })).created).toBe(false);
  });
  it("reclaims expired work and fences out the previous worker", async () => {
    const { repository, db } = await setup();
    const first = await repository.reserve(input);
    await db.update(schema.codingAttempts).set({ leaseExpiresAt: 1 }).where(eq(schema.codingAttempts.id, first.attempt.id));
    const replacement = createCodingAttemptRepository(db);
    const reclaimed = await replacement.reserve(input);
    expect(reclaimed.created).toBe(true);
    expect(reclaimed.attempt.id).toBe(first.attempt.id);
    await expect(repository.complete(first.attempt.id, evaluation)).rejects.toThrow("STALE_COMPLETION");
    await replacement.complete(first.attempt.id, evaluation);
  });
  it("does not spend a learner attempt on unavailable infrastructure", async () => {
    const { repository } = await setup();
    const first = await repository.reserve({ ...input, maxAttempts: 1 });
    await repository.complete(first.attempt.id, { ...evaluation, verdict: "ungradable" });
    expect((await repository.reserve({ ...input, maxAttempts: 1, request: { ...request, requestId: "next" } })).created).toBe(true);
  });
  it("blocks concurrent jobs and refuses browser evaluation as completion", async () => {
    const { repository } = await setup();
    const first = await repository.reserve(input);
    await expect(repository.reserve({ ...input, request: { ...request, requestId: "next" } })).rejects.toThrow("ATTEMPT_BUSY");
    await expect(repository.complete(first.attempt.id, { ...evaluation, authority: "browser_practice" })).rejects.toThrow("INVALID_COMPLETION");
  });
});
