import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/db/schema";
import {
  addBookingResource,
  deleteBookingResource,
  getBookingResources,
} from "@/lib/schedule/session-resources";

async function createResourceDb() {
  const client = createClient({
    url: `file:/tmp/zyx_resource_${randomUUID().replace(/-/g, "")}.db`,
  });
  const testDb = drizzle(client, { schema });

  const schemaSql = `
    CREATE TABLE user (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      role TEXT DEFAULT 'student',
      last_activity_at INTEGER
    );
    CREATE TABLE pengguna (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE peran (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE pengguna_peran (
      id TEXT PRIMARY KEY,
      pengguna_id TEXT NOT NULL,
      peran_id TEXT NOT NULL,
      source TEXT NOT NULL,
      audit_actor_pengguna_id TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE groups (
      id TEXT PRIMARY KEY,
      name TEXT,
      package_type TEXT,
      package_name TEXT,
      total_quota_sessions INTEGER,
      used_quota_sessions INTEGER,
      weekly_quota_sessions INTEGER,
      academic_year TEXT,
      semester TEXT,
      start_date INTEGER,
      end_date INTEGER,
      status TEXT NOT NULL,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE group_members (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      joined_at INTEGER NOT NULL
    );
    CREATE TABLE tutor_slots (
      id TEXT PRIMARY KEY,
      tutor_id TEXT NOT NULL,
      day_of_week TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      mode TEXT NOT NULL,
      location TEXT,
      session_date TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE bookings (
      id TEXT PRIMARY KEY,
      slot_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      status TEXT NOT NULL,
      session_date TEXT,
      start_time TEXT,
      end_time TEXT,
      mode TEXT NOT NULL,
      location TEXT,
      google_meet_url TEXT,
      google_meet_space_name TEXT,
      last_modified_by TEXT,
      last_modified_at INTEGER NOT NULL,
      topic TEXT,
      pre_session_notes TEXT,
      pre_session_attachments TEXT,
      post_session_notes TEXT,
      post_session_attachments TEXT,
      post_session_link_url TEXT,
      post_session_link_title TEXT,
      post_session_link_description TEXT,
      post_session_link_image TEXT,
      completed_at INTEGER,
      completed_by_id TEXT,
      booked_at INTEGER NOT NULL
    );
    CREATE TABLE booking_resources (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL,
      phase TEXT NOT NULL,
      kind TEXT NOT NULL,
      label TEXT NOT NULL,
      url TEXT NOT NULL,
      file_name TEXT,
      mime_type TEXT,
      size_bytes INTEGER,
      metadata TEXT,
      created_by_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `;
  for (const statement of schemaSql.split(";").map((sql) => sql.trim()).filter(Boolean)) {
    await client.execute(statement);
  }

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
