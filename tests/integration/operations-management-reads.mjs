import assert from "node:assert/strict";
import { mock } from "bun:test";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { createPostgresTestDb } from "../helpers/postgres";
import { PERAN_SEEDS } from "../../lib/auth/peran";
import { blogArticles, customFormPresets, discussionChannels, discussionMessages, discussionReports, discussionThreads, penggunaPeran, peran, session, user } from "../../db/schema";
const { client, testDb } = await createPostgresTestDb();
let current = null,
  googleCalls = 0;
mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db: testDb }));
mock.module("@/lib/db", () => ({ db: testDb }));
mock.module("@/lib/auth-session", () => ({
  getAuthSession: async () => current && { user: current, session: { id: current.id + "-session" } },
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
  const { GET, POST } = await import(
    "../../app/api/native/operations/management/route"
  );
  const check = async (view, expected, id, account = current?.id, details = {}) => {
    const url =
      "http://example.invalid/api/native/operations/management?" +
      new URLSearchParams({ view, ...(id ? { id } : {}), ...details });
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
      "form-preset",
      "pricing",
      "discussions",
      "discussion",
      "discussion-reports",
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
  assert.deepEqual(await check("form-presets", 200), { items: [] });
  const preset = {
    id: "synth-preset", name: "Preset sintetis", description: "Deskripsi lengkap", category: "survey",
    questions: [{ title: "Topik?", type: "RADIO", options: ["Materi"] }], settings: { displayMode: "section" },
  };
  await testDb.insert(customFormPresets).values(preset);
  assert.deepEqual(await check("form-presets", 200), {
    items: [{ id: preset.id, name: preset.name, category: preset.category, hasSettings: true }],
  });
  const detail = await check("form-preset", 200, preset.id);
  assert.deepEqual(detail.questions, preset.questions);
  assert.deepEqual(detail.settings, preset.settings);
  assert.equal(detail.description, preset.description);
  assert.match(detail.revision, /^[a-f0-9]{64}$/);
  await check("form-preset", 403, preset.id, "other");
  await check("form-preset", 404, "absent");
  await check("form-preset", 400);
  const p = await check("pricing", 200);
  assert.ok(p.discounts.platform);
  assert.deepEqual(p.vouchers, []);
  await check("discussions", 200);
  await check("discussion", 404, "absent");
  await check("discussion", 404, "absent", current.id, { message: "older-message" });
  await check("discussion", 400, "absent", current.id, { message: "older-message", cursor: "another-page" });
  assert.deepEqual(await check("discussion-reports", 200), { items: [] });
  await testDb.insert(discussionChannels).values({ id: "ops-target-global", kind: "global", title: "Forum" }).onConflictDoNothing();
  const [discussionChannel] = await testDb.select({ id: discussionChannels.id }).from(discussionChannels).where(eq(discussionChannels.kind, "global"));
  const thread = { id: "ops-target-thread", channelId: discussionChannel.id, authorId: current.id, title: "Targeted discussion", nextSeq: 3, answerCount: 1 };
  await testDb.insert(discussionThreads).values(thread);
  const messages = [
    { id: "first-message", threadId: thread.id, authorId: current.id, kind: "human", messageType: "question", body: "A question", seq: 1, requestId: "first-request" },
    { id: "older/reply", threadId: thread.id, authorId: current.id, kind: "human", messageType: "answer", body: "The linked answer", seq: 2, requestId: "second-request" },
  ];
  await testDb.insert(discussionMessages).values(messages);
  const createdAt = new Date("2026-01-02T13:00:00Z");
  await testDb.insert(discussionReports).values({ createdAt, id: "ops-link-report", messageId: messages[1].id, reporterId: "manage-student", reason: "Review this" });
  const page = await check("discussion", 200, thread.id, current.id, { message: messages[1].id });
  assert.equal(page.thread.title, thread.title);
  assert.deepEqual(page.items.map(item => item.id), [messages[1].id]);
  assert.ok(page.observationReceipt);
  assert.deepEqual((await check("discussion-reports", 200)).items, [
    { id: "ops-link-report", messageId: messages[1].id, threadId: thread.id, title: thread.title, reason: "Review this", reporterName: "student", createdAt: createdAt.toISOString(), status: "pending" },
  ]);
  await testDb.insert(session).values({ id: current.id + "-session", userId: current.id, token: "moderator-local", expiresAt: new Date(Date.now() + 3600_000) });
  const moderate = async (id, status, expected, sessionId = current.id + "-session") => {
    const response = await POST(new NextRequest("http://example.invalid/api/native/operations/management", {
      method: "POST", headers: { "content-type": "application/json", "x-native-operations-user-id": current.id,
        "x-native-operations-session-id": sessionId }, body: JSON.stringify({ type: "discussion.moderate-report", id, status }),
    }));
    assert.equal(response.status, expected);
  };
  await moderate("ops-link-report", "resolved", 403, "retired-session");
  await moderate("missing-report", "resolved", 404);
  await moderate("ops-link-report", "dismissed", 200);
  await moderate("ops-link-report", "dismissed", 200);
  await moderate("ops-link-report", "resolved", 409);
  const [decision] = await testDb.select().from(discussionReports).where(eq(discussionReports.id, "ops-link-report"));
  assert.equal(decision.status, "dismissed");
  assert.equal(decision.resolvedById, current.id);
  await check("discussion", 404, thread.id, current.id, { message: "other-thread-message" });

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
