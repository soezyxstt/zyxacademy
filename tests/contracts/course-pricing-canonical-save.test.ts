import { afterAll, describe, expect, it, mock } from "bun:test";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { createPostgresTestDb } from "../helpers/postgres";

const { client, testDb } = await createPostgresTestDb();
mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db: testDb }));
mock.module("@/lib/db", () => ({ db: testDb }));
mock.module("next/cache", () => ({ revalidatePath: () => {} }));
mock.module("@/lib/auth/admin-guards", () => ({ assertAdmin: async () => ({ user: { id: "identity-admin" } }) }));
const { saveCourseWithCanonicalProjection: save } = await import("@/lib/academic/course-canonical-sync");
const { getCourses, getCourseSettingsData, saveCourse } = await import("@/app/(admin)/admin/(academic)/courses/actions");
afterAll(() => client.close());

const free = { category: "free" as const, startsAt: null, endsAt: null };
const input = { title: "Updated", category: "Fisika" as const, isNew: false };

describe("course pricing canonical identity save", () => {
  it("updates the actual legacy projection from either identity and preserves omitted pricing", async () => {
    await testDb.insert(schema.courses).values({ id: "identity-alias", title: "Legacy", category: "Fisika" });
    expect((await getCourses())[0].pricing.category).toBe("premium");
    await testDb.insert(schema.mataKuliah).values({ id: "identity-canonical", code: "IDENTITY", title: "Canonical", legacyCourseId: "identity-alias", pricingCategory: "free" });
    await save({ ...input, id: "identity-canonical" });
    expect((await testDb.select().from(schema.courses).where(eq(schema.courses.id, "identity-alias")))[0].title).toBe("Updated");
    await save({ ...input, id: "identity-alias", title: "Alias update" });
    const [row] = await testDb.select().from(schema.mataKuliah).where(eq(schema.mataKuliah.id, "identity-canonical"));
    expect([row.title, row.legacyCourseId, row.pricingCategory]).toEqual(["Alias update", "identity-alias", "free"]);
  });

  it("accepts the loader default in the real action for canonical-only courses without creating an alias", async () => {
    await testDb.insert(schema.user).values({ id: "identity-admin", name: "Admin", email: "identity-admin@test.local" });
    await testDb.insert(schema.pengguna).values({ id: "identity-admin" });
    await testDb.insert(schema.mataKuliah).values({ id: "identity-only", code: "ONLY", title: "Only" });
    const course = (await getCourses()).find((row) => row.id === "identity-only")!;
    expect([course.category, course.pricing.category]).toEqual(["Umum", "premium"]);
    expect((await saveCourse(course.id, course.title, "Fisika", course.description, false, free)).success).toBe(false);
    expect((await saveCourse(course.id, course.title, course.category, "Lost description", false, free)).success).toBe(false);
    await expect(save({ ...input, id: course.id })).rejects.toThrow("COURSE_PROJECTION_UNAVAILABLE");
    expect((await saveCourse(course.id, course.title, course.category, course.description, false, free)).success).toBe(true);
    expect((await saveCourse(course.id, "Renamed", course.category, null, false)).success).toBe(true);
    const [row] = await testDb.select().from(schema.mataKuliah).where(eq(schema.mataKuliah.id, course.id));
    expect([row.title, row.legacyCourseId, row.pricingCategory]).toEqual(["Renamed", null, "free"]);
    expect(await testDb.select().from(schema.courses).where(eq(schema.courses.id, course.id))).toHaveLength(0);
    expect((await saveCourse("new-invalid", "Invalid", "Umum", null, true, free)).success).toBe(false);
    await expect(save({ ...input, id: "identity-new-invalid", category: "Umum", isNew: true })).rejects.toThrow("COURSE_PROJECTION_UNAVAILABLE");
    await expect(save({ ...input, id: "identity-alias", category: "Umum" })).rejects.toThrow("COURSE_PROJECTION_UNAVAILABLE");
  });

  it("saves pricing from settings opened by either canonical or legacy identity", async () => {
    for (const routeId of ["identity-canonical", "identity-alias"]) {
      const settings = await getCourseSettingsData(routeId);
      expect(settings).not.toBeNull();
      expect([settings!.id, settings!.category, settings!.pricing.category]).toEqual(["identity-canonical", "Fisika", "free"]);
      expect((await saveCourse(settings!.id, settings!.title, settings!.category, settings!.description, false, free)).success).toBe(true);
    }
  });

  it("rejects missing identities and ambiguous aliases without changing either course", async () => {
    await expect(save({ ...input, id: "identity-missing" })).rejects.toThrow("COURSE_NOT_FOUND");
    await testDb.insert(schema.courses).values({ id: "identity-shared", title: "Shared", category: "Fisika" });
    await testDb.insert(schema.mataKuliah).values([
      { id: "identity-first", code: "FIRST", title: "First", legacyCourseId: "identity-shared" },
      { id: "identity-second", code: "SECOND", title: "Second", legacyCourseId: "identity-shared" },
    ]);
    await expect(save({ ...input, id: "identity-shared" })).rejects.toThrow("COURSE_IDENTITY_AMBIGUOUS");
    await expect(save({ ...input, id: "identity-first" })).rejects.toThrow("COURSE_IDENTITY_AMBIGUOUS");
    expect((await testDb.select().from(schema.courses).where(eq(schema.courses.id, "identity-shared")))[0].title).toBe("Shared");
    expect((await testDb.select().from(schema.mataKuliah).where(eq(schema.mataKuliah.id, "identity-first")))[0].title).toBe("First");
  });

  it("rejects a legacy ID collision with a different canonical alias", async () => {
    await testDb.insert(schema.courses).values([
      { id: "identity-collision", title: "Other", category: "Fisika" },
      { id: "identity-real", title: "Real", category: "Fisika" },
    ]);
    await testDb.insert(schema.mataKuliah).values({ id: "identity-collision", code: "COLLISION", title: "Real", legacyCourseId: "identity-real" });
    await expect(save({ ...input, id: "identity-collision" })).rejects.toThrow("COURSE_IDENTITY_AMBIGUOUS");
    await expect(save({ ...input, id: "identity-real" })).rejects.toThrow("COURSE_IDENTITY_AMBIGUOUS");
    expect((await testDb.select().from(schema.courses).where(eq(schema.courses.id, "identity-real")))[0].title).toBe("Real");
  });
});
