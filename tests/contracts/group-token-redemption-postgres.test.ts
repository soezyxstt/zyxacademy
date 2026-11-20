import { AsyncLocalStorage } from "node:async_hooks";
import { readdir, readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@/db/schema";

// Run this file alone against a fresh local PostgreSQL database named
// group_redemption_test, using ZYX_GROUP_REDEMPTION_TEST_DB as its connection URL.
const databaseUrl = process.env.ZYX_GROUP_REDEMPTION_TEST_DB;

describe.skipIf(!databaseUrl)("student group token redemption on PostgreSQL", () => {
  const actor = new AsyncLocalStorage<string>();
  const sessionUser = () => ({ id: actor.getStore() });
  const courseId = "premium-course";
  const canonicalId = "canonical-premium-course";
  const termEnd = new Date(Date.now() + 7 * 86400_000);
  const earlierEnd = new Date(Date.now() - 86400_000);
  const laterEnd = new Date(Date.now() + 14 * 86400_000);
  let pool: pg.Pool;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let dashboard: typeof import("@/app/(student)/dashboard/actions").enrollWithToken;
  let groups: typeof import("@/app/(student)/dashboard/groups/actions").joinGroupWithToken;
  let resolveAccess: typeof import("@/lib/student/course-access").resolveCourseAccess;

  beforeAll(async () => {
    const target = new URL(databaseUrl!);
    expect(["postgres:", "postgresql:"]).toContain(target.protocol);
    expect(["127.0.0.1", "[::1]", "localhost"]).toContain(target.hostname);
    expect(target.pathname).toBe("/group_redemption_test");
    expect(target.search).toBe("");
    pool = new pg.Pool({ connectionString: target.href, statement_timeout: 8000, max: 5 });
    const { rows: [fixture] } = await pool.query("select to_regclass('public.group_members') as existing");
    expect(fixture.existing).toBeNull();

    const migrations = new URL("../../drizzle-postgres/", import.meta.url);
    const files = (await readdir(migrations)).filter(file => file.endsWith(".sql")).sort();
    for (const file of files) await pool.query(await readFile(new URL(file, migrations), "utf8"));
    db = drizzle(pool, { schema });

    mock.module("@/db", () => ({ db }));
    mock.module("@/lib/auth-session", () => ({ requireAuthUser: async () => sessionUser() }));
    mock.module("@/lib/auth", () => ({ auth: { api: { getSession: async () => ({ user: sessionUser() }) } } }));
    mock.module("next/headers", () => ({ headers: async () => new Headers() }));
    mock.module("next/cache", () => ({ revalidatePath: () => undefined }));
    mock.module("@/lib/learning-events", () => ({ recordLearningEvent: () => undefined }));
    mock.module("@/lib/inngest", () => ({ inngest: {} }));
    mock.module("@/lib/course-utils", () => ({ getStudentMaterialAccess: () => undefined, isFreeChapterScoped: () => false }));
    mock.module("@/lib/pemahaman/evidence", () => ({ recordLearningEvidence: () => undefined }));
    mock.module("@/lib/schedule-lock", () => ({ getIsoWeekRange: () => undefined, computeWeeklySessionStats: () => [] }));
    mock.module("@/lib/schedule/tutor-policy", () => ({ getGroupWeeklyUsage: () => undefined }));
    mock.module("@/lib/gamification/social", () => ({ getVisibleStudentIdentities: () => undefined }));

    const dashboardActions = await import("@/app/(student)/dashboard/actions");
    const groupActions = await import("@/app/(student)/dashboard/groups/actions");
    dashboard = dashboardActions.enrollWithToken;
    groups = groupActions.joinGroupWithToken;
    resolveAccess = (await import("@/lib/student/course-access")).resolveCourseAccess;

    await db.insert(schema.courses).values({ id: courseId, title: "Premium course", category: "Matematika" });
    await db.insert(schema.mataKuliah).values({ id: canonicalId, title: "Premium course", code: "PREMIUM", legacyCourseId: courseId });
    await db.insert(schema.peran).values({ id: "role-murid", code: "murid" }).onConflictDoNothing();
  }, 15000);

  afterAll(async () => { await pool?.end(); });

  async function student(id: string) {
    await db.insert(schema.user).values({ id, name: id, email: `${id}@example.test` });
    await db.insert(schema.pengguna).values({ id });
    const [role] = await db.select({ id: schema.peran.id }).from(schema.peran).where(eq(schema.peran.code, "murid"));
    await db.insert(schema.penggunaPeran).values({ id: `role-${id}`, penggunaId: id, peranId: role.id, source: "test" });
  }

  async function token(groupId: string, tokenId = groupId, assignedCourse = courseId) {
    await db.insert(schema.groups).values({ id: groupId, name: groupId, endDate: termEnd }).onConflictDoNothing();
    await db.insert(schema.enrollmentTokens).values({ id: tokenId, token: tokenId, groupId, capacity: 1, expiresAt: termEnd });
    await db.insert(schema.enrollmentTokenCourses).values({ tokenId, courseId: assignedCourse });
    return tokenId;
  }

  async function memberships(groupId: string) {
    return db.select().from(schema.groupMembers).where(eq(schema.groupMembers.groupId, groupId));
  }

  async function grants(userId: string) {
    return db.select().from(schema.enrollments).where(eq(schema.enrollments.userId, userId));
  }

  async function seedGrant(userId: string, status: "expired" | "completed", endAt: Date | null) {
    const id = `legacy-${userId}`;
    await db.insert(schema.enrollments).values({ id, userId, courseId, expiresAt: earlierEnd });
    await db.insert(schema.pendaftaranMurid).values({
      id: `canonical-${userId}`, penggunaId: userId, mataKuliahId: canonicalId, status, endAt, legacyEnrollmentId: id,
    });
  }

  async function expectGrant(userId: string, status: "active" | "completed", endAt: Date | null, legacyEnd = termEnd) {
    const [legacy] = await grants(userId);
    expect(legacy.expiresAt).toEqual(legacyEnd);
    const mirror = await db.select().from(schema.pendaftaranMurid)
      .where(and(eq(schema.pendaftaranMurid.penggunaId, userId), eq(schema.pendaftaranMurid.mataKuliahId, canonicalId)));
    expect(mirror).toHaveLength(1);
    expect(mirror[0]).toMatchObject({ status, endAt, legacyEnrollmentId: legacy.id });
    expect((await resolveAccess({ courseId, userId })).tier).toBe("enrolled");
  }

  test("only one student receives the last seat across both actions", async () => {
    const first = await token("last-seat");
    const second = await token("last-seat", "other-token");
    await student("first-student");
    await student("second-student");

    const lock = await pool.connect();
    await lock.query("begin");
    await lock.query("select id from groups where id = $1 for no key update", ["last-seat"]);
    const redemptions = Promise.all([
      actor.run("first-student", () => dashboard(first)),
      actor.run("second-student", () => groups(second)),
    ]);
    let blocked = 0;
    try {
      for (let attempt = 0; attempt < 100 && blocked !== 2; attempt++) {
        const { rows: [locks] } = await pool.query(`select count(*)::int as blocked from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock' and query like 'select%from "groups"%'`);
        blocked = locks.blocked;
        if (blocked !== 2) await Bun.sleep(10);
      }
    } finally {
      await lock.query("rollback");
      lock.release();
    }
    const results = await redemptions;
    expect(blocked).toBe(2);
    expect(results.filter(result => result.success)).toHaveLength(1);
    const memberRows = await memberships("last-seat");
    expect(memberRows).toHaveLength(1);
    const winner = memberRows[0].userId;
    await expectGrant(winner, "active", termEnd);
    const loser = winner === "first-student" ? "second-student" : "first-student";
    expect(await grants(loser)).toHaveLength(0);
  });

  test("simultaneous redemption retries share one membership and one grant", async () => {
    const key = await token("same-student");
    const id = "retry-student";
    await student(id);
    const results = await actor.run(id, () => Promise.all([dashboard(key), groups(key)]));
    expect(results.filter(result => result.success)).toHaveLength(1);
    expect(await memberships("same-student")).toHaveLength(1);
    expect(await grants(id)).toHaveLength(1);
  });

  test("both actions renew expired legacy and canonical grants", async () => {
    for (const [id, redeem] of [["returning-dashboard", dashboard], ["returning-groups", groups]] as const) {
      await student(id);
      await seedGrant(id, "expired", earlierEnd);
      const key = await token(id);
      expect((await resolveAccess({ courseId, userId: id })).tier).toBe("free");
      expect((await actor.run(id, () => redeem(key))).success).toBe(true);
      expect(await memberships(id)).toHaveLength(1);
      expect(await grants(id)).toHaveLength(1);
      await expectGrant(id, "active", termEnd);
    }
  });

  test("a full group permits a repair retry and preserves longer canonical grants", async () => {
    for (const [id, redeem, endAt] of [
      ["finite-repair", dashboard, laterEnd],
      ["unlimited-repair", groups, null],
    ] as const) {
      await student(id);
      const key = await token(id);
      await db.insert(schema.groupMembers).values({ id: `membership-${id}`, groupId: id, userId: id });
      await seedGrant(id, "completed", endAt);
      expect((await actor.run(id, () => redeem(key))).success).toBe(true);
      await expectGrant(id, "completed", endAt);
      expect((await actor.run(id, () => redeem(key))).success).toBe(false);
      expect(await memberships(id)).toHaveLength(1);
    }
  });

  test("repair adds a missing canonical mirror without shortening legacy access", async () => {
    const id = "legacy-only-student";
    await student(id);
    const key = await token(id);
    await db.insert(schema.groupMembers).values({ id: `membership-${id}`, groupId: id, userId: id });
    await db.insert(schema.enrollments).values({ id: `legacy-${id}`, userId: id, courseId, expiresAt: laterEnd });
    expect((await actor.run(id, () => dashboard(key))).success).toBe(true);
    expect(await memberships(id)).toHaveLength(1);
    await expectGrant(id, "active", laterEnd, laterEnd);
  });

  test("a failed canonical grant releases the seat and rolls back legacy access", async () => {
    const id = "rollback-student";
    await student(id);
    await db.insert(schema.courses).values({ id: "unmapped-course", title: "Unmapped", category: "Matematika" });
    const key = await token("rollback-group", "rollback-token", "unmapped-course");
    expect((await actor.run(id, () => groups(key))).success).toBe(false);
    expect(await memberships("rollback-group")).toHaveLength(0);
    expect(await grants(id)).toHaveLength(0);
    await db.insert(schema.mataKuliah).values({ id: "mapped-after-retry", title: "Mapped", code: "MAPPED", legacyCourseId: "unmapped-course" });
    expect((await actor.run(id, () => dashboard(key))).success).toBe(true);
    expect(await memberships("rollback-group")).toHaveLength(1);
  });
});
