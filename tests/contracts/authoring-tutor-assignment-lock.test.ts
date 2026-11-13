import { afterAll, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/db/schema";
import { createPostgresTestDb } from "../helpers/postgres";

const { client } = await createPostgresTestDb();
const queries: { sql: string; params: unknown[] }[] = [];
let denySubjectLock = false;
const testDb = drizzle(client, { schema, logger: { logQuery(sql, params) {
  queries.push({ sql, params });
  if (denySubjectLock && sql.includes('from "user"') && sql.includes("for update")) throw new Error("LOCK_FAILURE");
} } });
mock.module("@/db", () => ({ db: testDb }));
const { assertAuthoringActor, lockTutorAssignmentChanges } = await import("@/lib/auth/authoring-actor");
const { provisionPenggunaForNewUser } = await import("@/lib/auth/authorization");
const { checkTutorCourseAccess } = await import("@/lib/auth/tutor-access");
const { dualWriteTutorAssignment, revokeCanonicalTutorCourseAssignments } = await import("@/lib/migrasi/repository-kompatibilitas");
afterAll(async () => { await client.close(); });

// These tests exercise emitted PostgreSQL locks and committed ordering in
// PGlite. They do not simulate concurrent sessions or PostgreSQL lock contention.
test("canonical and legacy tutor assignments use the same user-row mutex as authoring reviews", async () => {
  const tutorId = "assignment-lock-tutor", courseId = "assignment-lock-legacy", canonicalId = "assignment-lock-canonical";
  await testDb.insert(schema.user).values({ id: tutorId, name: "Tutor", email: "assignment-lock@example.test", role: "teacher" });
  await provisionPenggunaForNewUser({ id: tutorId, role: "teacher" });
  await testDb.insert(schema.courses).values({ id: courseId, title: "Course", category: "Math" });
  await testDb.insert(schema.mataKuliah).values({ id: canonicalId, title: "Course", code: "LOCK", legacyCourseId: courseId });
  await testDb.insert(schema.tutorCourses).values({ id: "fallback-assignment", tutorId, courseId });
  queries.length = 0;
  await testDb.transaction(async tx => {
    await assertAuthoringActor(tx, tutorId, { roles: ["tutor"], error: "FORBIDDEN", lock: true });
    expect((await checkTutorCourseAccess(tutorId, canonicalId, undefined, tx)).source).toBe("compatibility_fallback");
  });
  const share = queries.findIndex(query => query.sql.includes('from "user"') && query.sql.includes("for share"));
  const assignmentsRead = queries.findIndex(query => query.sql.includes('from "penugasan_tutor"'));
  expect(share).toBeGreaterThanOrEqual(0);
  expect(queries[share].params).toContain(tutorId);
  expect(assignmentsRead).toBeGreaterThan(share);

  queries.length = 0;
  await testDb.transaction(async tx => {
    await revokeCanonicalTutorCourseAssignments(tx, tutorId);
    await tx.delete(schema.tutorCourses).where(eq(schema.tutorCourses.tutorId, tutorId));
  });
  const exclusive = queries.findIndex(query => query.sql.includes('from "user"') && query.sql.includes("for update"));
  const mutation = queries.findIndex(query => query.sql.startsWith('update "penugasan_tutor"'));
  const legacyMutation = queries.findIndex(query => query.sql.startsWith('delete from "tutor_courses"'));
  expect(exclusive).toBeGreaterThanOrEqual(0);
  expect(queries[exclusive].params).toContain(tutorId);
  expect(mutation).toBeGreaterThan(exclusive);
  expect(legacyMutation).toBeGreaterThan(exclusive);
  expect((await checkTutorCourseAccess(tutorId, canonicalId)).hasAccess).toBe(false);

  await testDb.insert(schema.tutorCourses).values({ id: "canonical-assignment", tutorId, courseId });
  queries.length = 0;
  await testDb.transaction(tx => dualWriteTutorAssignment(tx, { id: "canonical-assignment", tutorId, courseId }));
  const grantLock = queries.findIndex(query => query.sql.includes('from "user"') && query.sql.includes("for update"));
  expect(queries.findIndex(query => query.sql.startsWith('insert into "penugasan_tutor"'))).toBeGreaterThan(grantLock);
  expect(grantLock).toBeGreaterThanOrEqual(0);
  await testDb.transaction(async tx => {
    await assertAuthoringActor(tx, tutorId, { roles: ["tutor"], error: "FORBIDDEN", lock: true });
    expect((await checkTutorCourseAccess(tutorId, courseId, undefined, tx)).source).toBe("canonical_assignment");
  });
  await testDb.transaction(tx => revokeCanonicalTutorCourseAssignments(tx, tutorId));
  await testDb.transaction(async tx => {
    await assertAuthoringActor(tx, tutorId, { roles: ["tutor"], error: "FORBIDDEN", lock: true });
    expect((await checkTutorCourseAccess(tutorId, canonicalId, undefined, tx)).hasAccess).toBe(false);
  });
  // A revoked canonical row blocks the still-present legacy projection.
  expect(await testDb.select().from(schema.tutorCourses).where(eq(schema.tutorCourses.tutorId, tutorId))).toHaveLength(1);
});

test("a missing or failed assignment subject lock prevents assignment mutations", async () => {
  await expect(testDb.transaction(tx => lockTutorAssignmentChanges(tx, "missing-tutor"))).rejects.toThrow("TUTOR_ASSIGNMENT_SUBJECT_NOT_FOUND");
  const before = await testDb.select().from(schema.penugasanTutor);
  denySubjectLock = true;
  try {
    await expect(testDb.transaction(tx => revokeCanonicalTutorCourseAssignments(tx, "assignment-lock-tutor"))).rejects.toThrow("LOCK_FAILURE");
  } finally { denySubjectLock = false; }
  expect(await testDb.select().from(schema.penugasanTutor)).toEqual(before);
});
