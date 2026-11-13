import { afterAll, describe, expect, it, mock } from "bun:test";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { createPostgresTestDb } from "../helpers/postgres";

const { client, testDb } = await createPostgresTestDb();
let authorized = true;
mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db: testDb }));
mock.module("next/cache", () => ({ revalidatePath: () => {} }));
mock.module("@/lib/auth/admin-guards", () => ({ assertAdmin: async () => { if (!authorized) throw new Error("FORBIDDEN"); return { user: { id: "admin" } }; } }));
const { saveCourse } = await import("@/app/(admin)/admin/(academic)/courses/actions");
afterAll(() => client.close());

describe("admin course pricing action", () => {
  it("validates the boundary, saves schedules, and preserves omitted pricing", async () => {
    await testDb.insert(schema.user).values({ id: "admin", name: "Admin", email: "admin@test.local", role: "admin" });
    await testDb.insert(schema.pengguna).values({ id: "admin", status: "active" });
    const invalid = await saveCourse("test-course", "Test", "Fisika", null, true, { category: "limited_time_free", startsAt: null, endsAt: null });
    expect(invalid.success).toBe(false);
    expect(invalid.error).not.toContain("INVALID_");
    expect(await testDb.select().from(schema.courses)).toHaveLength(0);
    const startsAt = new Date("2030-01-01T01:00:00Z");
    const endsAt = new Date("2030-01-02T01:00:00Z");
    expect((await saveCourse("test-course", "Test", "Fisika", null, true, { category: "limited_time_free", startsAt, endsAt })).success).toBe(true);
    expect((await saveCourse("test-course", "Updated", "Fisika", null, false)).success).toBe(true);
    const [row] = await testDb.select().from(schema.mataKuliah).where(eq(schema.mataKuliah.id, "test-course"));
    expect([row.pricingCategory, row.freeStartsAt, row.freeEndsAt]).toEqual(["limited_time_free", startsAt, endsAt]);
    expect((await saveCourse("test-course", "Updated", "Fisika", null, false, { category: "free", startsAt, endsAt })).success).toBe(true);
    const [free] = await testDb.select().from(schema.mataKuliah).where(eq(schema.mataKuliah.id, "test-course"));
    expect([free.pricingCategory, free.freeStartsAt, free.freeEndsAt]).toEqual(["free", null, null]);
    authorized = false;
    await expect(saveCourse("test-course", "Denied", "Fisika", null, false)).rejects.toThrow("FORBIDDEN");
    const [unchanged] = await testDb.select().from(schema.courses).where(eq(schema.courses.id, "test-course"));
    expect(unchanged.title).toBe("Updated");
  });
});
