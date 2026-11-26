import assert from "node:assert/strict";
import { mock } from "bun:test";
import { eq } from "drizzle-orm";
import {
  auditMutasi,
  blogArticles,
  customForms,
  customFormResponses,
  penggunaPeran,
  peran,
  session,
  user,
} from "../../db/schema";
import { PERAN_SEEDS } from "../../lib/auth/peran";
import { createPostgresTestDb } from "../helpers/postgres";

const { client, testDb } = await createPostgresTestDb();
mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db: testDb }));
mock.module("@/lib/db", () => ({ db: testDb }));
mock.module("next/cache", () => ({ revalidatePath() {} }));

try {
  const { ensureLegacyIdentity } = await import(
    "../../lib/auth/legacy-identity"
  );
  const { nativeAuthoringMutation, nativeAuthoringStatus } = await import(
    "../../app/api/native/operations/management/authoring"
  );
  const admin = { id: "admin-fixture", sessionId: "native-session-fixture" };
  const other = { id: "student-fixture", sessionId: "native-student-session" };
  await testDb
    .insert(peran)
    .values([...PERAN_SEEDS])
    .onConflictDoNothing();
  for (const [actor, role] of [
    [admin, "admin"],
    [other, "student"],
  ]) {
    await testDb
      .insert(user)
      .values({
        id: actor.id,
        name: actor.id,
        email: `${actor.id}@example.invalid`,
        role,
      });
    await ensureLegacyIdentity(actor.id);
    await testDb
      .insert(session)
      .values({
        id: actor.sessionId,
        token: `${actor.sessionId}-token`,
        userId: actor.id,
        expiresAt: new Date("2099-01-01T00:00:00Z"),
      });
  }
  const origin = "https://native-fixture.example.invalid";
  const apply = (key, action, actor = admin) =>
    nativeAuthoringMutation(actor, origin, key, action);
  const failure = (status, key, action, actor) =>
    assert.rejects(
      apply(key, action, actor),
      (error) => nativeAuthoringStatus(error) === status,
    );

  const article = {
    type: "article.save",
    fields: {
      title: "Judul artikel",
      content: "Isi draf.",
      category: "tips_kuliah",
      status: "draft",
      tags: [],
    },
  };
  await failure(403, "denied-draft-request", article, other);
  const created = await apply("create-draft-request", article);
  assert.deepEqual(await apply("create-draft-request", article), created);
  await failure(409, "create-draft-request", {
    ...article,
    fields: { ...article.fields, content: "Isi berbeda." },
  });
  assert.equal((await testDb.select().from(blogArticles)).length, 1);
  const updated = await apply("edit-draft-request", {
    ...article,
    id: created.id,
    revision: created.revision,
    fields: { ...article.fields, content: "Isi revisi." },
  });
  assert.notEqual(updated.revision, created.revision);
  await failure(409, "stale-draft-request", {
    ...article,
    id: created.id,
    revision: created.revision,
  });
  assert.equal((await testDb.select().from(blogArticles))[0].status, "draft");

  const fields = {
    title: "Formulir simulasi",
    description: "",
    slug: "formulir-simulasi",
    category: "survey",
    questions: [{ title: "Tanggapan?", type: "TEXT" }],
    settings: { acceptingResponses: false },
  };
  const form = await apply("create-form-request", {
    type: "form.save",
    fields,
  });
  assert.deepEqual(
    await apply("create-form-request", { type: "form.save", fields }),
    form,
  );
  const settings = await apply("set-form-closed-request", {
    type: "form.settings",
    id: form.id,
    revision: form.revision,
    settings: { acceptingResponses: false, closedMessage: "Ditutup." },
  });
  await failure(409, "stale-form-save-request", {
    type: "form.save",
    id: form.id,
    revision: form.revision,
    fields,
  });
  await testDb
    .insert(customFormResponses)
    .values({
      id: "synthetic-response",
      formId: form.id,
      answers: { 0: "Tanggapan lokal." },
    });
  await failure(409, "changed-question-request", {
    type: "form.save",
    id: form.id,
    revision: settings.revision,
    fields: {
      ...fields,
      questions: [{ title: "Pertanyaan baru?", type: "TEXT" }],
    },
  });
  const [row] = await testDb
    .select()
    .from(customForms)
    .where(eq(customForms.id, form.id));
  assert.equal(row.settings.closedMessage, "Ditutup.");
  assert.equal(row.questions[0].title, "Tanggapan?");
  assert.equal((await testDb.select().from(auditMutasi)).length, 4);
  await testDb
    .delete(penggunaPeran)
    .where(eq(penggunaPeran.penggunaId, admin.id));
  await failure(403, "create-draft-request", article);
  console.log("Management authoring transaction and permission checks passed");
} finally {
  await client.close();
}
