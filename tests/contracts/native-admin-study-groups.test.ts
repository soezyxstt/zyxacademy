import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import * as tables from "@/db/schema";
import type { GroupDeletion, GroupDeletionView } from "@/packages/academic/group-deletion";
import { createPostgresTestDb } from "../helpers/postgres";

const { testDb, client } = await createPostgresTestDb();
mock.module("@/db", () => ({ db: testDb }));
mock.module("@/lib/db", () => ({ db: testDb }));
mock.module("server-only", () => ({}));
mock.module("next/cache", () => ({ revalidatePath() {} }));

const { handleAdminCommand } = await import("@/lib/native/academic/administration/admin-command-handler");
const { readGroupDeletion, writeGroupDeletion } = await import("@/lib/native/academic/administration/group-deletion-service");
const { readNativeStudyGroupEditor, saveNativeStudyGroup } = await import("@/lib/native/academic/administration/study-group-service");
const { readNativeStudyGroupMembers, writeNativeStudyGroupMember } = await import("@/lib/native/academic/administration/study-group-members-service");
const { issueEnrollmentTokenWithGroup } = await import("@/lib/groups/enrollment-token-lifecycle");
const { z } = await import("zod");

const admin = "native-groups-admin";
const student = "native-groups-learner";
const first = "native-group-course-first";
const second = "native-group-course-second";
const viewer = { user: { id: admin }, session: { id: "native-groups-main-session" } };
const alternate = { ...viewer, session: { id: "native-groups-other-session" } };
const denied = { user: { id: student }, session: { id: "native-groups-student-session" } };

beforeAll(async () => {
  await testDb.insert(tables.peran).values({ id: "native-groups-admin-role", code: "admin" }).onConflictDoNothing();
  const [role] = await testDb.select().from(tables.peran).where(eq(tables.peran.code, "admin"));
  await testDb.insert(tables.user).values([admin, student].map(id => ({ id, name: id, email: id + "@example.test" })));
  await testDb.insert(tables.pengguna).values([admin, student].map(id => ({ id, status: "active" as const })));
  await testDb.insert(tables.penggunaPeran).values({ id: "native-groups-admin-access", penggunaId: admin, peranId: role.id, source: "test" });
  await testDb.insert(tables.session).values([viewer, alternate, denied].map(actor => ({
    id: actor.session.id, userId: actor.user.id, token: actor.session.id, expiresAt: new Date(Date.now() + 300_000),
  })));
  await testDb.insert(tables.courses).values([first, second].map(id => ({ id, title: id, category: "Matematika" as const })));
  await testDb.insert(tables.mataKuliah).values([first, second].map((id, index) => ({
    id: id + "-canonical", legacyCourseId: id, code: "NGROUP-" + index, title: id,
  })));
}, 60_000);
afterAll(async () => { await client.close(); });

const confirm = (target: GroupDeletionView): GroupDeletion => ({
  action: "delete", kind: target.kind, id: target.id, groupId: target.groupId, expectedRevision: target.revision, confirmed: true,
});

test("token group editing and member operations preserve separate token course access", async () => {
  const issued = await testDb.transaction(tx => issueEnrollmentTokenWithGroup(tx as unknown as Parameters<typeof issueEnrollmentTokenWithGroup>[0], {
    courseIds: [first], capacity: 3, totalQuotaSessions: 0, weeklyQuotaSessions: 0, packageType: "custom",
  }));
  const editor = await readNativeStudyGroupEditor(issued.groupId);
  expect(editor?.type).toBe("edit");
  if (editor?.type !== "edit") throw new Error("Missing group edit");
  expect(editor.choices?.map(choice => choice.id)).toContain(second);
  const key = randomUUID();
  const fields = { ...editor.record.fields, courseIds: [second], expectedRevision: editor.record.revision };
  const command = { type: "edit", id: issued.groupId, fields } as const;
  expect(await saveNativeStudyGroup(command, key, viewer)).toMatchObject({ status: "saved", id: issued.groupId });
  expect(await saveNativeStudyGroup(command, key, viewer)).toMatchObject({ status: "saved", id: issued.groupId });
  expect(await saveNativeStudyGroup(command, randomUUID(), viewer)).toMatchObject({ status: "conflict" });
  expect((await testDb.select().from(tables.enrollmentTokenCourses).where(eq(tables.enrollmentTokenCourses.tokenId, issued.id))).map(row => row.courseId)).toEqual([first]);

  const snapshot = await readGroupDeletion({ kind: "token", id: issued.id }, viewer);
  const member = await readNativeStudyGroupMembers(issued.groupId, 1, student);
  expect(member?.canAdd).toBe(true);
  expect(member?.candidates.map(candidate => candidate.id)).toContain(student);
  await writeNativeStudyGroupMember(issued.groupId, {
    accountId: admin, action: "add", userId: student, expectedRevision: member!.revision,
  }, randomUUID(), viewer);
  await expect(writeGroupDeletion(confirm(snapshot!), randomUUID(), viewer)).rejects.toThrow("REVISION_CONFLICT");
  const later = await readNativeStudyGroupMembers(issued.groupId, 1, "");
  expect(later?.members.map(member => member.id)).toEqual([student]);
  await writeNativeStudyGroupMember(issued.groupId, {
    accountId: admin, action: "remove", userId: student, expectedRevision: later!.revision,
  }, randomUUID(), viewer);
  expect((await testDb.select().from(tables.enrollments).where(eq(tables.enrollments.userId, student))).map(row => row.courseId)).toEqual([second]);

  const finalView = await readGroupDeletion({ kind: "token", id: issued.id }, viewer);
  expect(finalView).toMatchObject({ groupId: issued.groupId, id: issued.id, members: 0, tokens: 1 });
  await expect(readGroupDeletion({ kind: "token", id: issued.id }, denied)).rejects.toThrow("FORBIDDEN");
  await expect(writeGroupDeletion({ ...confirm(finalView!), groupId: "different-group" }, randomUUID(), viewer)).rejects.toThrow("REVISION_CONFLICT");
  const deletion = confirm(finalView!);
  const deleteKey = randomUUID();
  expect(await writeGroupDeletion(deletion, deleteKey, viewer)).toEqual({ id: issued.id, replay: false });
  expect(await writeGroupDeletion(deletion, deleteKey, viewer)).toEqual({ id: issued.id, replay: true });
  await expect(writeGroupDeletion(deletion, deleteKey, alternate)).rejects.toThrow("NOT_FOUND");
  expect(await readGroupDeletion({ kind: "group", id: issued.groupId }, viewer)).toBeNull();
  expect(await readGroupDeletion({ kind: "token", id: issued.id }, viewer)).toBeNull();
  expect((await testDb.select().from(tables.enrollments).where(eq(tables.enrollments.userId, student))).map(row => row.courseId)).toEqual([second]);
});

test("direct group deletion is independently scoped and requires explicit confirmation in the native contract", async () => {
  const issued = await testDb.transaction(tx => issueEnrollmentTokenWithGroup(tx as unknown as Parameters<typeof issueEnrollmentTokenWithGroup>[0], {
    courseIds: [first], capacity: 1, totalQuotaSessions: 0, weeklyQuotaSessions: 0, packageType: "custom",
  }));
  const snapshot = await readGroupDeletion({ kind: "group", id: issued.groupId }, viewer);
  const body = confirm(snapshot!);
  const origin = "https://example.test";
  const schema = z.object({ kind: z.literal("group"), id: z.string(), action: z.literal("delete"),
    groupId: z.string(), expectedRevision: z.string(), confirmed: z.literal(true) });
  const send = (confirmed: boolean) => handleAdminCommand(new Request(origin, { method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", "Idempotency-Key": randomUUID() }, body: JSON.stringify({ ...body, confirmed }),
  }), origin, { session: async () => viewer, hasAdmin: async () => true }, schema, writeGroupDeletion);
  expect((await send(false)).status).toBe(422);
  expect(await readGroupDeletion({ kind: "token", id: issued.id }, viewer)).not.toBeNull();
  expect((await send(true)).status).toBe(200);
  expect(await readGroupDeletion({ kind: "token", id: issued.id }, viewer)).toBeNull();
});
