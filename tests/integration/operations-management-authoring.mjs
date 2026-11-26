import assert from "node:assert/strict";
import { mock } from "bun:test";
import { eq } from "drizzle-orm";
import {
  auditMutasi,
  blogArticles,
  customForms,
  customFormPresets,
  customFormResponses,
  penggunaPeran,
  peran,
  session,
  user,
} from "../../db/schema";
import { PERAN_SEEDS } from "../../lib/auth/peran";
import { createPostgresTestDb } from "../helpers/postgres";
import { formPresetPageSize } from "../../packages/native-parity/operations/management-contract";

const { client, testDb } = await createPostgresTestDb();
mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db: testDb }));
mock.module("@/lib/db", () => ({ db: testDb }));
mock.module("next/cache", () => ({ revalidatePath() {} }));
const summaries = [];
mock.module("@/lib/gemini", () => ({
  async generateContentWithFallback(input) {
    summaries.push(input);
    if (input.contents.includes("Cadangan ringkasan")) throw new Error("provider unavailable");
    return { response: { text: "Ringkasan dari ZYX!" } };
  },
}));

try {
  const { ensureLegacyIdentity } = await import(
    "../../lib/auth/legacy-identity"
  );
  const { readFormPreset, readFormPresets } = await import("../../app/api/native/operations/management/presets");
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
  assert.equal(summaries.length, 0);
  const created = await apply("create-draft-request", article);
  assert.deepEqual(await apply("create-draft-request", article), created);
  await failure(409, "create-draft-request", {
    ...article,
    fields: { ...article.fields, content: "Isi berbeda." },
  });
  assert.equal((await testDb.select().from(blogArticles)).length, 1);
  assert.equal((await testDb.select().from(blogArticles))[0].summary, "Ringkasan dari Zyx.");
  assert.equal(summaries.length, 1);
  assert.match(summaries[0].requestId, /^native-blog:[a-f0-9]{64}$/);
  assert.equal(summaries[0].feature, "blog-summary");
  assert.equal(summaries[0].userId, admin.id);
  const updated = await apply("edit-draft-request", {
    ...article,
    id: created.id,
    revision: created.revision,
    fields: { ...article.fields, content: "Isi revisi.", summary: "Ringkasan tulisan Admin." },
  });
  assert.notEqual(updated.revision, created.revision);
  await failure(409, "stale-draft-request", {
    ...article,
    id: created.id,
    revision: created.revision,
  });
  assert.equal((await testDb.select().from(blogArticles))[0].status, "draft");
  assert.equal((await testDb.select().from(blogArticles))[0].summary, "Ringkasan tulisan Admin.");
  assert.equal(summaries.length, 1);

  const fields = {
    title: "Formulir simulasi",
    description: "",
    slug: "formulir-simulasi",
    category: "survey",
    questions: [
      { title: "Tanggapan?", type: "TEXT" },
      { title: "Topik?", type: "CHECKBOX", options: ["Materi"], showDescription: false, description: "Deskripsi contoh", shuffleOptions: true, otherOption: { enabled: true, label: "Topik lain" } },
      { title: "Penilaian?", type: "SCALE", scaleLow: 0, scaleHigh: 8, scaleLowLabel: "Perlu bantuan", scaleHighLabel: "Mandiri" },
      { title: "Lampiran?", type: "FILE_UPLOAD", maxFileSizeMb: 25, allowedFileTypes: ["application/pdf"] },
    ],
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
  const [storedForm] = await testDb.select().from(customForms).where(eq(customForms.id, form.id));
  assert.deepEqual(storedForm.questions, fields.questions);
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
  assert.equal((await testDb.select().from(auditMutasi).where(eq(auditMutasi.entityType, "native_operations"))).length, 4);
  const fallbackAction = { ...article, id: updated.id, revision: updated.revision,
    fields: { ...article.fields, content: "Cadangan ringkasan jika penyedia tidak tersedia." } };
  const fallback = await apply("fallback-summary-request", fallbackAction);
  assert.deepEqual(await apply("fallback-summary-request", fallbackAction), fallback);
  assert.equal((await testDb.select().from(blogArticles))[0].summary, fallbackAction.fields.content);
  assert.equal(summaries.length, 2);
  const [summaryReceipt] = await testDb.select().from(auditMutasi).where(eq(auditMutasi.entityType, "native_operations_provider"));
  assert.doesNotMatch(JSON.stringify(summaryReceipt.afterSnapshot), /Ringkasan|Isi draf/);
  const presetFields = { name: "Preset latihan", description: "Susun ulang nanti", category: "survey", questions: [{ title: "", type: "RADIO", options: [""] }], settings: { displayMode: "section" } };
  const createPreset = { type: "form.preset.create", fields: presetFields };
  const preset = await apply("create-preset-request", createPreset);
  assert.deepEqual(await apply("create-preset-request", createPreset), preset);
  assert.equal((await testDb.select().from(customFormPresets)).length, 1);
  assert.deepEqual((await readFormPresets()).items, [{ id: preset.id, name: presetFields.name, category: presetFields.category, hasSettings: true }]);
  assert.deepEqual((await readFormPreset(preset.id)).questions, presetFields.questions);
  const renamed = await apply("rename-preset-request", { type: "form.preset.update", id: preset.id, revision: preset.revision, name: "Preset baru", description: "" });
  await failure(409, "stale-preset-delete-request", { type: "form.preset.delete", id: preset.id, revision: preset.revision });
  await apply("delete-preset-request", { type: "form.preset.delete", id: preset.id, revision: renamed.revision });
  assert.deepEqual((await readFormPresets()).items, []);
  await assert.rejects(readFormPreset(preset.id), { code: "not-found" });
  assert.equal((await testDb.select().from(customForms)).length, 1);
  await testDb.insert(customFormPresets).values({ id: "legacy-preset", name: "Legacy", questions: [], settings: { openAt: "2026-12-01T09:00", closeAt: "2026-12-02T09:00" } });
  assert.equal((await readFormPreset("legacy-preset")).settings.openAt, "2026-12-01T02:00:00.000Z");
  const createdAt = new Date("2090-01-01T00:00:00Z");
  await testDb.insert(customFormPresets).values(Array.from({ length: formPresetPageSize + 1 }, (_, index) => ({
    id: `page-preset-${index.toString().padStart(2, "0")}`, name: "a".repeat(700), questions: [{ title: "Isi lengkap", type: "TEXT" }], settings: {}, createdAt,
  })));
  const first = await readFormPresets();
  assert.equal(first.items.length, formPresetPageSize);
  assert.equal(first.items[0].name.length, 500);
  assert.ok(first.nextCursor);
  await testDb.delete(customFormPresets).where(eq(customFormPresets.id, first.items.at(-1).id));
  const older = await readFormPresets(first.nextCursor);
  assert.deepEqual(older.items.map(item => item.id), ["page-preset-00", "legacy-preset"]);
  assert.equal(older.nextCursor, undefined);
  assert.deepEqual((await readFormPresets(undefined, true)).items.map(item => item.id), ["legacy-preset"]);
  await assert.rejects(readFormPresets("invalid-cursor"), { code: "invalid" });
  await testDb
    .delete(penggunaPeran)
    .where(eq(penggunaPeran.penggunaId, admin.id));
  await failure(403, "create-draft-request", article);
  console.log("Management authoring transaction and permission checks passed");
} finally {
  await client.close();
}
