import { describe, expect, test, mock } from "bun:test";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";

const client = createClient({ url: ":memory:" });
const testDb = drizzle(client, { schema });

await client.executeMultiple(`
  CREATE TABLE courses (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT
  );
  CREATE TABLE mata_kuliah (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    is_demo INTEGER NOT NULL DEFAULT 0,
    legacy_course_id TEXT REFERENCES courses(id),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

mock.module("@/db", () => ({ db: testDb }));
const { listStudentCourses } = await import("@/lib/student/course-catalog");

describe("student course catalog compatibility suppression", () => {
  test("does not reintroduce legacy rows for inactive or ambiguous canonical mappings", async () => {
    const now = new Date("2026-09-14T00:00:00.000Z");
    await testDb.insert(schema.courses).values([
      { id: "legacy-archived", title: "Archived Legacy", category: "Fisika" },
      { id: "legacy-ambiguous", title: "Ambiguous Legacy", category: "Kimia" },
    ]);
    await testDb.insert(schema.mataKuliah).values([
      {
        id: "mk-archived",
        code: "ARCHIVED-101",
        title: "Archived Canonical",
        status: "archived",
        legacyCourseId: "legacy-archived",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "mk-ambiguous-a",
        code: "AMBIGUOUS-101",
        title: "Ambiguous A",
        status: "active",
        legacyCourseId: "legacy-ambiguous",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "mk-ambiguous-b",
        code: "AMBIGUOUS-102",
        title: "Ambiguous B",
        status: "active",
        legacyCourseId: "legacy-ambiguous",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const courses = await listStudentCourses();

    expect(courses.map((course) => course.id)).not.toEqual(
      expect.arrayContaining(["legacy-archived", "legacy-ambiguous"]),
    );
    expect(courses).toHaveLength(0);

    await testDb.delete(schema.mataKuliah).where(eq(schema.mataKuliah.id, "mk-archived"));
    await testDb.delete(schema.mataKuliah).where(eq(schema.mataKuliah.id, "mk-ambiguous-a"));
    await testDb.delete(schema.mataKuliah).where(eq(schema.mataKuliah.id, "mk-ambiguous-b"));
    await testDb.delete(schema.courses).where(eq(schema.courses.id, "legacy-archived"));
    await testDb.delete(schema.courses).where(eq(schema.courses.id, "legacy-ambiguous"));
  });

  test("suppresses both canonical rows in a canonical and legacy alias collision", async () => {
    const now = new Date("2026-09-14T00:00:00.000Z");
    await testDb.insert(schema.courses).values({ id: "legacy-canonical-id", title: "Legacy Collision", category: "Fisika" });
    await testDb.insert(schema.mataKuliah).values([
      {
        id: "mk-with-alias",
        code: "COLLISION-101",
        title: "Canonical With Alias",
        status: "active",
        legacyCourseId: "legacy-canonical-id",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "legacy-canonical-id",
        code: "COLLISION-102",
        title: "Canonical Alias ID",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    expect(await listStudentCourses()).toHaveLength(0);

    await testDb.delete(schema.mataKuliah).where(eq(schema.mataKuliah.id, "mk-with-alias"));
    await testDb.delete(schema.mataKuliah).where(eq(schema.mataKuliah.id, "legacy-canonical-id"));
    await testDb.delete(schema.courses).where(eq(schema.courses.id, "legacy-canonical-id"));
  });

  test("does not suppress canonical course when legacyCourseId matches its own id", async () => {
    const now = new Date("2026-09-14T00:00:00.000Z");
    await testDb.insert(schema.courses).values({
      id: "matematika-1",
      title: "Matematika I",
      category: "Matematika",
      description: "Kelas persiapan ITB TPB",
    });
    await testDb.insert(schema.mataKuliah).values({
      id: "matematika-1",
      code: "legacy-matematika-1",
      title: "Matematika I",
      status: "active",
      legacyCourseId: "matematika-1",
      createdAt: now,
      updatedAt: now,
    });

    const courses = await listStudentCourses();
    expect(courses).toHaveLength(1);
    expect(courses[0].id).toBe("matematika-1");
    expect(courses[0].title).toBe("Matematika I");

    await testDb.delete(schema.mataKuliah).where(eq(schema.mataKuliah.id, "matematika-1"));
    await testDb.delete(schema.courses).where(eq(schema.courses.id, "matematika-1"));
  });
});
