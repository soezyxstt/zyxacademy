import { expect, test } from "bun:test";
import { emptyArticle, newForm, type FormFields } from "./management-contract";
import { createManagementFixture } from "./management-fixtures";
import { articlePublicationIntent, draftConflictKey, formAcceptanceChanged, mergeManagementDraft } from "./management-revisions";

test("merges local edits without withdrawing an article published by another Admin", async () => {
  const client = createManagementFixture({ mode: "empty" });
  const baseline = { ...emptyArticle, title: "Latihan", content: "Contoh awal." };
  const created = await client.mutate({ type: "article.save", fields: baseline }, "initial-draft");
  const local = { ...baseline, content: "Paragraf tambahan." };
  const published = await client.mutate({ type: "article.save", id: created.id, revision: created.revision, fields: { ...baseline, status: "published" } }, "publish-from-web");
  await expect(client.mutate({ type: "article.save", id: created.id, revision: created.revision, fields: local }, "stale-local-draft")).rejects.toMatchObject({ code: "conflict" });
  const { id, author: _author, slug: _slug, revision, ...saved } = await client.read("article", created.id!);
  const merged = mergeManagementDraft(baseline, local, saved);
  expect(merged.ready).toBe(true);
  expect(merged.fields).toMatchObject({ content: local.content, status: "published" });
  expect(articlePublicationIntent(saved.status, merged.fields.status)).toBe("publish");
  expect(articlePublicationIntent(saved.status, "draft")).toBe("withdraw");
  expect(articlePublicationIntent("draft", "draft")).toBeNull();
  await client.mutate({ type: "article.save", id, revision, fields: merged.fields }, "reviewed-local-save");
  expect((await client.read("article", id)).status).toBe("published");
  expect(revision).toBe(published.revision!);
});

test("requires an explicit choice for text edited both locally and in storage", () => {
  const baseline = { ...emptyArticle, content: "Awal" };
  const local = { ...baseline, content: "Lokal", tags: ["latihan"] };
  const saved = { ...baseline, title: "Judul baru", content: "Tersimpan" };
  const initial = mergeManagementDraft(baseline, local, saved);
  expect(initial.ready).toBe(false);
  expect(initial.conflicts).toEqual([{ path: ["content"], local: "Lokal", saved: "Tersimpan" }]);
  const next = mergeManagementDraft(baseline, local, saved, { [draftConflictKey(["content"])]: "local" });
  expect(next.ready).toBe(true);
  expect(next.fields).toMatchObject({ content: "Lokal", title: "Judul baru", tags: ["latihan"] });
});

test("preserves unrelated settings edits and treats question order as one conflict", () => {
  const first = { title: "Pertanyaan 1", type: "TEXT" } as const;
  const second = { title: "Pertanyaan 2", type: "TEXT" } as const;
  const baseline: FormFields = { ...newForm(), settings: { acceptingResponses: true, displayMode: "question" } as const, questions: [first, second] };
  const local = { ...baseline, settings: { ...baseline.settings, closedMessage: "Terima kasih." }, questions: [second, first] };
  const saved = { ...baseline, settings: { ...baseline.settings, acceptingResponses: false }, questions: [first, { ...second, title: "Pertanyaan baru" }] };
  const result = mergeManagementDraft(baseline, local, saved, { [draftConflictKey(["questions"])]: "saved" });
  expect(result.ready).toBe(true);
  expect(result.conflicts.map(x => x.path)).toEqual([["questions"]]);
  expect(result.fields.settings).toEqual({ ...saved.settings, closedMessage: "Terima kasih." });
  expect(result.fields.questions).toEqual(saved.questions);
  expect(formAcceptanceChanged(saved.settings, result.fields.settings)).toBe(false);
  expect(formAcceptanceChanged(saved.settings, { ...result.fields.settings, acceptingResponses: true })).toBe(true);
});
