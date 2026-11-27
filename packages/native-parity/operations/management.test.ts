import { expect, test } from "bun:test";
import { createManagementHttpClient } from "../../../apps/mobile-native/features/operations/management/http";
import { emptyArticle, matchManagementPath, managementRoutes, newForm, validateArticle, validateForm, validateFormSettings } from "./management-contract";
import { createManagementFixture, managementCases } from "./management-fixtures";

const validArticle = { ...emptyArticle, content: "# Artikel lokal\n\nIsi artikel." };

test("registers three fixture cases for each owned management route", () => {
  expect(managementCases).toHaveLength(39);
  expect(new Set(managementCases.map(item => item.id)).size).toBe(39);
  for (const route of managementRoutes) expect(managementCases.filter(item => item.route === route)).toHaveLength(3);
  for (const item of managementCases) expect(matchManagementPath(item.path)?.route).toBe(item.route);
  expect(matchManagementPath("/admin/blog/new/edit")?.id).toBe("new");
  expect(matchManagementPath("/admin/blog/%2F/edit")).toBeNull();
  expect(matchManagementPath("/admin/docs/%gh")).toBeNull();
  expect(matchManagementPath("/admin/forms?edit=form-local")?.query.get("edit")).toBe("form-local");
});

test("recovers a transient read and isolates fixtures and denied accounts", async () => {
  const failing = createManagementFixture({ mode: "recoverable-error" });
  await expect(failing.read("articles", undefined)).rejects.toMatchObject({ code: "unavailable" });
  expect((await failing.read("articles", undefined)).length).toBeGreaterThan(0);
  const other = createManagementFixture({ mode: "empty" });
  expect(await other.read("articles", undefined)).toEqual([]);
  const denied = createManagementFixture({ admin: false });
  await expect(denied.read("forms", undefined)).rejects.toMatchObject({ code: "forbidden" });
  await expect(denied.mutate({ type: "article.save", fields: validArticle }, "denied-write")).rejects.toMatchObject({ code: "forbidden" });
});

test("replays an unchanged article draft save once and rejects stale revisions", async () => {
  const local = createManagementFixture({ mode: "empty" });
  const operation = { type: "article.save", fields: validArticle } as const;
  const [first, repeated] = await Promise.all([local.mutate(operation, "create"), local.mutate(operation, "create")]);
  expect(first).toEqual(repeated);
  expect(await local.read("articles", undefined)).toHaveLength(1);
  expect((await local.read("articles", undefined))[0]).not.toHaveProperty("content");
  const original = await local.read("article", first.id!);
  const updated = await local.mutate({ type: "article.save", id: original.id, revision: original.revision, fields: { ...validArticle, title: "Suntingan" } }, "edit");
  expect(updated.revision).not.toBe(original.revision);
  await expect(local.mutate({ type: "article.save", id: original.id, revision: original.revision, fields: validArticle }, "stale")).rejects.toMatchObject({ code: "conflict" });
  await expect(local.mutate({ ...operation, fields: { ...validArticle, content: "Isi lain" } }, "create")).rejects.toMatchObject({ code: "conflict" });
  expect(validateArticle({ ...validArticle, status: "scheduled" })).toMatch(/belum tersedia/);
});

test("keeps form preview separate from responses and preserves response question positions", async () => {
  const admin = createManagementFixture();
  const { form, responses } = await admin.read("form", "form-local");
  expect(validateForm({ ...newForm(), title: "Survei", questions: [{ type: "RADIO", title: "Topik?" }] })).toMatch(/pilihan/);
  expect(validateFormSettings({ openAt: "2026-12-03T10:00:00Z", closeAt: "2026-11-30T12:00:00Z" })).toMatch(/lebih awal/);
  await expect(admin.mutate({ type: "form.save", id: form.id, revision: form.revision, fields: { ...form, questions: form.questions.slice(1) } }, "responses-conflict")).rejects.toMatchObject({ code: "invalid" });
  const saved = await admin.mutate({ type: "form.settings", id: form.id, revision: form.revision, settings: { acceptingResponses: false } }, "close-form");
  expect((await admin.read("form", form.id)).responses).toEqual(responses);
  await expect(admin.mutate({ type: "form.delete", id: form.id, revision: form.revision }, "stale-delete")).rejects.toMatchObject({ code: "conflict" });
  await admin.mutate({ type: "form.delete", id: form.id, revision: saved.revision! }, "confirmed-delete");
  await expect(admin.read("form", form.id)).rejects.toMatchObject({ code: "not-found" });
});

test("only copies out of storage and keeps source objects intact", async () => {
  const local = createManagementFixture();
  const storage = { space: "storage", folder: "course-materials" } as const;
  const { files } = await local.read("media", storage);
  const key = files[0].key;
  await expect(local.mutate({ type: "media.delete", key, folder: false }, "foreign-delete")).rejects.toMatchObject({ code: "not-found" });
  await local.mutate({ type: "media.copy", key, folder: false, destination: "" }, "copy");
  expect((await local.read("media", storage)).files).toEqual(files);
  expect((await local.read("media", { space: "media", folder: "" })).files.map(file => file.key)).toContain("media/latihan.pdf");
});

test("native HTTP adapter carries account and session binding and safely encodes identifiers", async () => {
  const requests: { path: string; init: NonNullable<Parameters<Parameters<typeof createManagementHttpClient>[0]["request"]>[1]> }[] = [];
  const client = createManagementHttpClient({ userId: "account-one", sessionId: "session-one", request: async (path, init) => {
    requests.push({ path, init });
    return { status: 200, ok: true, json: async () => ({ id: "saved" }), dispose() {} };
  } });
  await client.read("article", "a?mode=other");
  expect(requests[0].path).toContain("a%3Fmode%3Dother");
  expect(new Headers(requests[0].init.headers).get("x-native-operations-user-id")).toBe("account-one");
  await client.mutate({ type: "article.save", fields: validArticle }, "bound-write-request-1");
  const headers = new Headers(requests[1].init.headers);
  expect(headers.get("x-native-operations-session-id")).toBe("session-one");
  expect(headers.get("x-native-operations-request-key")).toBe("bound-write-request-1");
  expect(requests[1].init.retry).toBeUndefined();
  await client.mutate({ type: "meet.end", spaceName: "spaces/local" }, "meet-end-request-1");
  expect(requests).toHaveLength(3);
  expect(requests[2].init.retry).toBeUndefined();
});

test("Admin discussion deep links bind the exact thread and message to the existing authenticated GET", async () => {
  const calls: { url: URL; account?: string; method?: string }[] = [];
  const client = createManagementHttpClient({ userId: "ops-account", sessionId: "ops-session", request: async (path, init) => {
    calls.push({ url: new URL(path, "https://example.invalid"), account: new Headers(init.headers).get("x-native-operations-user-id") ?? undefined, method: init.method });
    return { status: 200, ok: true, json: async () => ({ items: [{ id: "older/reply" }] }), dispose() {} };
  } });
  await client.read("discussion", { id: "thread?key", message: "older/reply" });
  await client.read("discussionReports", { cursor: "page+2" });
  expect(calls.map(item => Object.fromEntries(item.url.searchParams))).toEqual([
    { view: "discussion", id: "thread?key", message: "older/reply" },
    { view: "discussion-reports", cursor: "page+2" },
  ]);
  expect(calls.map(({ method, account }) => [method, account])).toEqual([["GET", "ops-account"], ["GET", "ops-account"]]);
});

test("moderators may repeat a report decision and cannot overwrite a different final decision", async () => {
  const client = createManagementFixture();
  const report = (await client.read("discussionReports", {})).items[0];
  const approve = { type: "discussion.moderate-report", status: "resolved", id: report.id } as const;
  expect(await client.mutate(approve, "report-action")).toEqual({ id: report.id });
  expect(await client.mutate(approve, "repeat-report")).toEqual({ id: report.id });
  expect((await client.read("discussionReports", {})).items[0].status).toBe("resolved");
  await expect(client.mutate({ ...approve, status: "dismissed" }, "other")).rejects.toMatchObject({ code: "conflict" });
  await expect(createManagementFixture({ admin: false }).mutate(approve, "denied")).rejects.toMatchObject({ code: "forbidden" });
});
