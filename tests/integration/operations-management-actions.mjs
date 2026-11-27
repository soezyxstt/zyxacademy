import assert from "node:assert/strict";
import { mock } from "bun:test";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { createPostgresTestDb } from "../helpers/postgres";
import { PERAN_SEEDS } from "../../lib/auth/peran";
import {
  blogArticles,
  customForms,
  penggunaPeran,
  peran,
  user,
  session,
} from "../../db/schema";
const { client, testDb } = await createPostgresTestDb();
let current = null;
mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db: testDb }));
mock.module("@/lib/auth-session", () => ({
  getAuthSession: async () =>
    current && { user: current, session: { id: "session-" + current.id } },
}));
mock.module("@/lib/google-meet", () => ({
  listConferenceRecords: async () => {
    throw Error("unexpected provider");
  },
  getCompleteMeetingAnalytics: async () => {
    throw Error("unexpected provider");
  },
}));
mock.module("@/lib/db", () => ({ db: testDb }));
mock.module("next/cache", () => ({ revalidatePath: () => {} }));
let count = 0;
try {
  const { POST } = await import(
    "../../app/api/native/operations/management/route"
  );
  const form = {
    type: "form.save",
    fields: {
      title: "Survey",
      description: "Local",
      category: "survey",
      slug: "",
      questions: [{ title: "Question", type: "TEXT", required: true }],
      settings: { acceptingResponses: true },
    },
  };
  const article = {
    type: "article.save",
    fields: {
      title: "Draft",
      content: "Article content",
      summary: "Synthetic",
      thumbnailUrl: "",
      category: "tips_kuliah",
      tags: [],
      status: "draft",
    },
  };
  async function post(body, status, key = randomUUID(), extra = {}) {
    const req = new NextRequest(
      "https://example.invalid/api/native/operations/management",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-native-operations-request-key": key,
          ...(current
            ? {
                "x-native-operations-user-id": current.id,
                "x-native-operations-session-id": "session-" + current.id,
              }
            : {}),
          ...extra,
        },
        body: JSON.stringify(body),
      },
    );
    const r = await POST(req);
    const data = await r.json();
    assert.equal(r.status, status, JSON.stringify(data) + " " + body.type);
    assert.match(r.headers.get("cache-control"), /private, no-store/);
    count++;
    return data;
  }
  await post(form, 401);
  await testDb
    .insert(peran)
    .values([...PERAN_SEEDS])
    .onConflictDoNothing();
  for (const role of ["student", "teacher", "admin"]) {
    current = { id: "mw-" + role, role };
    await testDb
      .insert(user)
      .values({ ...current, name: role, email: role + "@example.invalid" });
    await testDb
      .insert(session)
      .values({
        id: "session-" + current.id,
        userId: current.id,
        token: randomUUID(),
        expiresAt: new Date(Date.now() + 1000000),
      });
    if (role !== "admin") await post(form, 403);
  }
  await post(form, 403, undefined, { "x-native-operations-user-id": "wrong" });
  await post(form, 403, undefined, {
    "x-native-operations-session-id": "wrong",
  });
  await post(form, 403, undefined, { origin: "https://else.example.invalid" });
  await post(form, 415, undefined, { "content-type": "text/plain" });
  const formKey = randomUUID();
  const a = await post(form, 200, formKey);
  const b = await post(form, 200, formKey);
  assert.deepEqual(a, b);
  assert.equal((await testDb.select().from(customForms)).length, 1);
  await post(
    { ...form, fields: { ...form.fields, title: "Different" } },
    409,
    formKey,
  );
  const changed = await post(
    {
      type: "form.settings",
      id: a.id,
      revision: a.revision,
      settings: { acceptingResponses: false },
    },
    200,
  );
  assert.notEqual(changed.revision, a.revision);
  await post({ type: "form.delete", id: a.id, revision: a.revision }, 409);
  await post(
    { type: "form.delete", id: a.id, revision: changed.revision },
    200,
  );
  const archived = await testDb.select().from(customForms);
  assert.ok(archived[0].deletedAt);
  assert.equal(archived.length, 1);
  const ak = randomUUID();
  const draft = await post(article, 200, ak);
  assert.deepEqual(await post(article, 200, ak), draft);
  const edit = await post(
    {
      ...article,
      id: draft.id,
      revision: draft.revision,
      fields: { ...article.fields, title: "Updated" },
    },
    200,
  );
  await post({ ...article, id: draft.id, revision: draft.revision }, 409);
  assert.equal((await testDb.select().from(blogArticles)).length, 1);
  await testDb
    .delete(penggunaPeran)
    .where(eq(penggunaPeran.penggunaId, current.id));
  await post(article, 403, ak);
  await post(form, 403, formKey);
  console.log("native management write handler responses tested", count);
} finally {
  await client.close();
}
