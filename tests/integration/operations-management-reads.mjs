import assert from "node:assert/strict";
import { mock } from "bun:test";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { createPostgresTestDb } from "../helpers/postgres";
import { PERAN_SEEDS } from "../../lib/auth/peran";
import { blogArticles, penggunaPeran, peran, user } from "../../db/schema";
const { client, testDb } = await createPostgresTestDb();
let current = null,
  googleCalls = 0;
mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db: testDb }));
mock.module("@/lib/db", () => ({ db: testDb }));
mock.module("@/lib/auth-session", () => ({
  getAuthSession: async () => current && { user: current },
}));
mock.module("@/lib/google-meet", () => ({
  listConferenceRecords: async () => {
    googleCalls++;
    return { conferenceRecords: [] };
  },
  getCompleteMeetingAnalytics: async () => {
    googleCalls++;
    throw Error("fixture unavailable");
  },
}));
let count = 0;
try {
  const { GET } = await import(
    "../../app/api/native/operations/management/route"
  );
  const check = async (view, expected, id, account = current?.id) => {
    const url =
      "http://example.invalid/api/native/operations/management?" +
      new URLSearchParams({ view, ...(id ? { id } : {}) });
    const r = await GET(
      new NextRequest(url, {
        headers: account ? { "x-native-operations-user-id": account } : {},
      }),
    );
    const body = await r.json();
    assert.equal(r.status, expected, JSON.stringify(body));
    assert.match(r.headers.get("cache-control"), /private, no-store/);
    count++;
    return body;
  };
  const guards = async (code) => {
    for (const view of [
      "articles",
      "article",
      "form-presets",
      "pricing",
      "discussions",
      "discussion",
      "meetings",
      "meeting",
    ])
      await check(view, code, "synth");
  };
  await guards(401);
  await testDb
    .insert(peran)
    .values([...PERAN_SEEDS])
    .onConflictDoNothing();
  for (const role of ["student", "teacher", "admin"]) {
    current = { id: "manage-" + role, role };
    await testDb
      .insert(user)
      .values({ ...current, name: role, email: role + "@example.invalid" });
    if (role !== "admin") await guards(403);
  }
  await check("articles", 403, undefined, "other");
  assert.equal(googleCalls, 0);
  await testDb
    .insert(blogArticles)
    .values({
      id: "draft-one",
      slug: "draft-one",
      title: "Synthetic draft",
      summary: "Synthetic",
      content: "Article body",
      category: "tips_kuliah",
      status: "draft",
    });
  const cards = await check("articles", 200);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].status, "draft");
  assert.equal("content" in cards[0], false);
  const a = await check("article", 200, "draft-one");
  assert.equal(a.content, "Article body");
  assert.match(a.revision, /^[a-f0-9]{64}$/);
  await check("article", 404, "absent");
  await check("article", 400);
  await check("article", 400, "x/y");
  assert.deepEqual(await check("form-presets", 200), []);
  const p = await check("pricing", 200);
  assert.ok(p.discounts.platform);
  assert.deepEqual(p.vouchers, []);
  await check("discussions", 200);
  await check("discussion", 404, "absent");
  await check("meetings", 200);
  await check("unknown", 404);
  assert.equal(googleCalls, 1);
  await testDb
    .delete(penggunaPeran)
    .where(eq(penggunaPeran.penggunaId, current.id));
  await guards(403);
  assert.equal(googleCalls, 1);
  console.log("private management handler cases passed", count);
} finally {
  await client.close();
}
