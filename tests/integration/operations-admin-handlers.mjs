import assert from "node:assert/strict";
import { mock } from "bun:test";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { PERAN_SEEDS } from "../../lib/auth/peran";
import { penggunaPeran, peran, user } from "../../db/schema";
import { createPostgresTestDb } from "../helpers/postgres";
const { client, testDb } = await createPostgresTestDb();
let current = null;
mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db: testDb }));
mock.module("../../lib/auth-session", () => ({
  getAuthSession: async () => current && { user: current },
}));
mock.module("../../lib/i18n/server", () => ({
  getTranslations: async () => (key) => key,
}));
mock.module("../../lib/ai/model-settings-store", () => ({
  listModelSettingViews: async () => [],
}));
mock.module("../../lib/analytics-dashboard", () => ({
  getDashboardMetrics: async (days) => ({ days }),
}));
let pass = 0;
try {
  const evalHandler = (
    await import("../../app/api/native/operations/evaluation/route")
  ).GET;
  const monitor = (await import("../../app/api/admin/native-monitoring/route"))
    .GET;
  const handlers = {
    eval: (href, view) =>
      evalHandler(
        new NextRequest(
          "http://example.invalid/api/native/operations/evaluation?" +
            new URLSearchParams({ href, ...(view ? { view } : {}) }),
        ),
      ),
    mon: (input) =>
      monitor(
        new Request(
          "http://example.invalid/api/admin/native-monitoring?" + input,
        ),
      ),
  };
  async function check(expected, request, verify) {
    const res = await request;
    const body = await res.json();
    assert.equal(res.status, expected, JSON.stringify(body));
    assert.match(res.headers.get("cache-control"), /private, no-store/);
    if (verify) verify(body);
    pass++;
  }
  async function denied(code) {
    for (const resource of [
      "/admin/assessments",
      "/admin/questions",
      "/admin/distractors",
      "/admin/jobs",
      "/admin/ast-inspector",
    ])
      await check(code, handlers.eval(resource), (b) =>
        assert.deepEqual(Object.keys(b), ["error"]),
      );
    for (const view of [
      "home",
      "web",
      "features",
      "models",
      "tutor",
      "tutorDetail",
    ])
      await check(code, handlers.mon("view=" + view), (b) =>
        assert.deepEqual(Object.keys(b), ["error"]),
      );
  }
  await denied(401);
  await testDb
    .insert(peran)
    .values([...PERAN_SEEDS])
    .onConflictDoNothing();
  for (const role of ["student", "teacher", "admin"]) {
    current = { id: "review-" + role, role };
    await testDb
      .insert(user)
      .values({ ...current, name: role, email: role + "@example.invalid" });
    if (role !== "admin") await denied(403);
  }
  await check(200, handlers.eval("/admin/assessments/a"), (b) =>
    assert.deepEqual(b, { kind: "redirect", href: "/admin/questions" }),
  );
  await check(200, handlers.eval("/admin/leaderboard?courseId=missing"), (b) =>
    assert.deepEqual(b, { kind: "redirect", href: "/admin/courses" }),
  );
  await check(404, handlers.eval("/admin/quizzes/missing/edit"));
  await check(200, handlers.eval("/admin/ast-inspector"), (b) =>
    assert.deepEqual(b, { authorized: true }),
  );
  await check(200, handlers.eval("/admin/jobs"), (b) =>
    assert.deepEqual(b.jobs, []),
  );
  await check(200, handlers.eval("/admin/distractors"), (b) =>
    assert.deepEqual(b, []),
  );
  await check(200, handlers.eval("/admin/questions"), (b) =>
    assert.equal(b.total, 0),
  );
  await check(200, handlers.eval("/admin/questions?tab=historical"), (b) =>
    assert.equal(b.historicalTotal, 0),
  );
  for (const view of ["selection", "chapters", "ideas"])
    await check(200, handlers.eval("/admin/questions", view), (b) =>
      assert.deepEqual(b, []),
    );
  await check(404, handlers.eval("/admin/nonexistent"));
  await check(200, handlers.mon("view=home"), (b) =>
    assert.ok(b.categories.length),
  );
  await check(200, handlers.mon("view=features&range=7"), (b) =>
    assert.equal(b.rangeDays, 7),
  );
  await check(200, handlers.mon("view=web"), (b) => assert.equal(b.days, 30));
  await check(200, handlers.mon("view=tutor&limit=2"), (b) =>
    assert.deepEqual(b.page.items, []),
  );
  await check(200, handlers.mon("view=tutorDetail&id=missing"), (b) =>
    assert.equal(b, null),
  );
  await check(400, handlers.mon("view=tutor&limit=10000"));
  await check(400, handlers.mon("view=tutor&cursorId=invalid"));
  await check(400, handlers.mon("view=unknown"));
  await testDb
    .delete(penggunaPeran)
    .where(eq(penggunaPeran.penggunaId, current.id));
  await denied(403);
  console.log("passed distinct handler responses", pass);
} finally {
  await client.close();
}
