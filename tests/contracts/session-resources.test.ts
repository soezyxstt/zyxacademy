import { afterEach, beforeAll, describe, expect, it } from "bun:test";
import { createPostgresTestDb } from "../helpers/postgres";
import * as schema from "@/db/schema";
import {
  addBookingResource,
  deleteBookingResource,
  getBookingResources,
} from "@/lib/schedule/session-resources";

const clients: Array<Awaited<ReturnType<typeof createPostgresTestDb>>["client"]> = [];
beforeAll(async () => {
  const { client } = await createPostgresTestDb();
  await client.close();
}, 60_000);
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

async function createResourceDb() {
  const { client, testDb } = await createPostgresTestDb();
  clients.push(client);

  const now = new Date("2026-08-17T01:00:00.000Z");
  await testDb.insert(schema.user).values([
    { id: "tutor-1", name: "Tutor", email: "tutor@test", role: "teacher", createdAt: now, updatedAt: now },
    { id: "student-1", name: "Student", email: "student@test", role: "student", createdAt: now, updatedAt: now },
    { id: "outsider-1", name: "Outsider", email: "outsider@test", role: "student", createdAt: now, updatedAt: now },
  ]);
  await testDb.insert(schema.pengguna).values([
    { id: "tutor-1", status: "active", createdAt: now, updatedAt: now },
    { id: "student-1", status: "active", createdAt: now, updatedAt: now },
    { id: "outsider-1", status: "active", createdAt: now, updatedAt: now },
  ]);
  await testDb.insert(schema.peran).values([
    { id: "role-tutor", code: "tutor" },
    { id: "role-murid", code: "murid" },
  ]);
  await testDb.insert(schema.penggunaPeran).values([
    { id: "pr-tutor", penggunaId: "tutor-1", peranId: "role-tutor", source: "test", createdAt: now },
    { id: "pr-student", penggunaId: "student-1", peranId: "role-murid", source: "test", createdAt: now },
  ]);
  await testDb.insert(schema.groups).values({
    id: "group-1",
    name: "Kelompok Satu",
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  await testDb.insert(schema.groupMembers).values({
    id: "member-1",
    groupId: "group-1",
    userId: "student-1",
    role: "leader",
    joinedAt: now,
  });
  await testDb.insert(schema.tutorSlots).values({
    id: "slot-1",
    tutorId: "tutor-1",
    dayOfWeek: "Rabu",
    startTime: "09:00",
    endTime: "10:30",
    mode: "online",
    sessionDate: "2026-08-26",
    createdAt: now,
  });
  await testDb.insert(schema.courses).values({ id: "course-1", title: "Course", category: "Test" });
  await testDb.insert(schema.bookings).values({
    id: "booking-1",
    slotId: "slot-1",
    studentId: "student-1",
    courseId: "course-1",
    groupId: "group-1",
    status: "scheduled",
    sessionDate: "2026-08-26",
    startTime: "09:00",
    endTime: "10:30",
    mode: "online",
    lastModifiedAt: now,
    bookedAt: now,
  });

  return { client, testDb, now };
}

describe("Session resource authorization contracts", () => {
  it("allows group-member pre writes, tutor reads, and tutor post writes", async () => {
    const { testDb, now } = await createResourceDb();

    const pre = await addBookingResource(
      {
        bookingId: "booking-1",
        phase: "pre",
        kind: "file",
        label: "Soal latihan",
        url: "https://files.test/question.pdf",
        fileName: "question.pdf",
        mimeType: "application/pdf",
        sizeBytes: 42,
      },
      { actorId: "student-1", executor: testDb, now },
    );
    expect(pre.success).toBe(true);

    const tutorRead = await getBookingResources("booking-1", {
      actorId: "tutor-1",
      executor: testDb,
    });
    expect(tutorRead.success).toBe(true);
    if (tutorRead.success) {
      expect(tutorRead.resources).toHaveLength(1);
      expect(tutorRead.resources[0].phase).toBe("pre");
    }

    const post = await addBookingResource(
      {
        bookingId: "booking-1",
        phase: "post",
        kind: "link",
        label: "Ringkasan sesi",
        url: "https://notes.test/session-1",
      },
      { actorId: "tutor-1", executor: testDb, now },
    );
    expect(post.success).toBe(true);
  });

  it("rejects outsiders and students writing post-session resources", async () => {
    const { testDb } = await createResourceDb();
    const outsider = await addBookingResource(
      {
        bookingId: "booking-1",
        phase: "pre",
        kind: "link",
        label: "Tidak boleh",
        url: "https://example.test",
      },
      { actorId: "outsider-1", executor: testDb },
    );
    expect(outsider).toMatchObject({ success: false, reason: "RESOURCE_WRITE_FORBIDDEN" });

    const studentPost = await addBookingResource(
      {
        bookingId: "booking-1",
        phase: "post",
        kind: "link",
        label: "Tidak boleh",
        url: "https://example.test",
      },
      { actorId: "student-1", executor: testDb },
    );
    expect(studentPost).toMatchObject({ success: false, reason: "RESOURCE_WRITE_FORBIDDEN" });
  });

  it("deletes resources only through the phase-aware writer boundary", async () => {
    const { testDb } = await createResourceDb();
    const added = await addBookingResource(
      {
        bookingId: "booking-1",
        phase: "pre",
        kind: "file",
        label: "Bukti",
        url: "https://files.test/evidence.pdf",
      },
      { actorId: "student-1", executor: testDb },
    );
    expect(added.success).toBe(true);
    if (!added.success) return;

    const denied = await deleteBookingResource(added.resource.id, {
      actorId: "outsider-1",
      executor: testDb,
    });
    expect(denied).toMatchObject({ success: false, reason: "RESOURCE_DELETE_FORBIDDEN" });

    const deleted = await deleteBookingResource(added.resource.id, {
      actorId: "student-1",
      executor: testDb,
    });
    expect(deleted).toEqual({ success: true, resourceId: added.resource.id });
  });
});
