import assert from "node:assert/strict";
import test from "node:test";
import { createAcademicClient, type AcademicCommand } from "../../../../apps/mobile-native/features/academic/client";
import { handleAdminCourseMaterialCommand } from "../../../../lib/native/academic/course-material-command";
import type { AdminMaterialTitleDraft } from "./edit-contract";

const origin = "https://academic.invalid";
const path = "/api/native/academic/admin/courses/biologi-dasar/documents/document-1/metadata";
const draft: AdminMaterialTitleDraft = { title: "Modul biologi sel", expectedRevision: "a".repeat(64) };
const requestId = "pdf-title-native-request";
const signal = new AbortController().signal;

function harness(role: "admin" | "tutor" | null) {
  const sent: { path: string; command: AcademicCommand }[] = [];
  const written: AdminMaterialTitleDraft[] = [];
  const dispatch = (resource: string, body: unknown, id = requestId, requestOrigin = origin) => handleAdminCourseMaterialCommand(
    new Request(origin + resource, {
      method: "PATCH", headers: { Origin: requestOrigin, "Content-Type": "application/json", "Idempotency-Key": id },
      body: JSON.stringify(body),
    }),
    resource.split("/").slice(4).map(decodeURIComponent), origin, {
      session: async () => role ? { user: { id: "account-admin" }, session: { id: "session-admin" } } : null,
      hasAdmin: async (id) => role === "admin" && id === "account-admin",
      update: async (course, material, value) => {
        if (course !== "biologi-dasar" || material !== "document-1") throw new Error("MATERIAL_NOT_FOUND");
        if (value.expectedRevision !== draft.expectedRevision) throw new Error("REVISION_CONFLICT");
        written.push(value);
      },
    },
  );
  const client = createAcademicClient({
    accountId: "account-admin", origin, locale: "id",
    async get() { throw new Error("Unexpected read."); },
    async command(resource, command) {
      sent.push({ path: resource, command });
      return dispatch(resource, command.body, command.requestId);
    },
  });
  return { client, dispatch, sent, written };
}

test("PDF title client sends scoped resource, original revision and expected mutation fields", async () => {
  const { client, sent, written } = harness("admin");
  const target = client.updateMaterial!("biologi-dasar", "document-1");
  assert.deepEqual(await target.submit(draft, requestId, signal), { status: "saved" });
  assert.deepEqual(sent, [{ path, command: { method: "PATCH", body: draft, requestId } }]);
  assert.deepEqual(written, [draft]);
  target.acknowledge(requestId);
  assert.deepEqual(await target.submit({ ...draft, expectedRevision: "b".repeat(64) }, "stale-pdf-title-request", signal), { status: "conflict" });
  assert.deepEqual(await client.updateMaterial!("fisika-dasar", "document-1").submit(draft, requestId, signal), { status: "missing" });
  assert.deepEqual(await client.updateMaterial!("biologi-dasar", "canonical-article").submit(draft, requestId, signal), { status: "missing" });
});

test("PDF title route rejects unsupported sources and metadata, invalid origin, and unauthorized roles", async () => {
  const { dispatch, written } = harness("admin");
  assert.equal((await dispatch(path, { ...draft, title: " " })).status, 422);
  assert.equal((await dispatch(path, { ...draft, status: "published" })).status, 422);
  assert.equal((await dispatch(path, { ...draft, fileUrl: "changed" })).status, 422);
  assert.equal((await dispatch(path, { ...draft, chapterIds: ["other-course-chapter"] })).status, 422);
  assert.equal((await dispatch(path.replace("document-1", "foreign%2Fdocument"), draft)).status, 400);
  assert.equal((await dispatch(path, draft, requestId, "https://other.invalid")).status, 403);
  assert.equal((await harness("tutor").dispatch(path, draft)).status, 403);
  assert.equal((await harness(null).dispatch(path, draft)).status, 401);
  assert.deepEqual(written, []);
});

test("PDF titles containing NUL are rejected before a native command or server write", async () => {
  const { client, dispatch, sent, written } = harness("admin");
  const target = client.updateMaterial!("biologi-dasar", "document-1");
  const invalid = { ...draft, title: "Modul\0biologi" };
  assert.deepEqual(await target.submit(invalid, requestId, signal), { status: "invalid" });
  assert.equal(target.pending(), null);
  assert.deepEqual(sent, []);
  const response = await dispatch(path, invalid);
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), { error: "INVALID_MATERIAL" });
  assert.deepEqual(written, []);
  assert.deepEqual(await target.submit(draft, requestId, signal), { status: "saved" });
});

test("native PDF editing sends taxonomy, year and chapter selection without dropping the old title-only payload", async () => {
  const host = harness("admin");
  const metadata = { type: "soal", subcategory: "uts", year: 2024, chapterIds: ["chapter-visible"] } as const;
  const input = { ...draft, metadata: { ...metadata, chapterIds: [...metadata.chapterIds] } };
  const target = host.client.updateMaterial!("biologi-dasar", "document-1");
  assert.deepEqual(await target.submit(input, requestId, signal), { status: "saved" });
  assert.deepEqual(host.written, [input]);
  for (const patch of [{ subcategory: "ebook" }, { year: 1800 }, { chapterIds: [] }, { chapterIds: ["one", "one"] }]) {
    assert.equal((await host.dispatch(path, { ...draft, metadata: { ...metadata, ...patch } })).status, 422);
  }
});
