import assert from "node:assert/strict";
import test from "node:test";
import { createAcademicClient, type AcademicTransport } from "../../../../apps/mobile-native/features/academic/client";
import { handleAdminCourseChapterCommand } from "../../../../lib/native/academic/course-chapter-command";
import type { AdminChapterDraft } from "./edit-contract";

const origin = "https://academic.invalid";
const base = "/api/native/academic/admin/courses/biologi-dasar/chapters";
const requestId = "chapter-original-request";
const draft: AdminChapterDraft = { title: "Bab sel", description: "Organel", expectedRevision: "a".repeat(64) };
const signal = new AbortController().signal;

function harness(role: "admin" | "tutor" | null) {
  const seen: { slug: string; chapterId: string | undefined; requestId: string; body: AdminChapterDraft; userId: string }[] = [];
  const structure: unknown[] = [];
  function send(method: string, path: string, body: unknown, key = requestId, requestOrigin = origin) {
    return handleAdminCourseChapterCommand(
      new Request(origin + path, { method, headers: { Origin: requestOrigin, "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(body) }),
      path.split("/").slice(4).map(decodeURIComponent), origin, {
        session: async () => role ? { user: { id: "local-admin" }, session: { id: "local-session" } } : null,
        hasAdmin: async (id) => role === "admin" && id === "local-admin",
        save: async (slug, chapterId, body, key, { user }) => {
          seen.push({ slug, chapterId, requestId: key, body, userId: user.id });
          if (chapterId === "foreign") throw new Error("CHAPTER_NOT_FOUND");
          if (chapterId === "stale") throw new Error("REVISION_CONFLICT");
        },
        archive: async (slug, id, body, key) => { structure.push(["archive", slug, id, body, key]); },
        reorder: async (slug, body, key) => { structure.push(["reorder", slug, body, key]); },
      },
    );
  }
  const client = createAcademicClient({
    accountId: "local-admin", origin, locale: "id",
    async get() { throw new Error("Unexpected read."); },
    async command(path, command, requestSignal) {
      requestSignal.throwIfAborted();
      return send(command.method, path, command.body, command.requestId);
    },
  });
  return { send, client, seen, structure };
}

test("chapter adapter uses distinct create and edit targets with the same request identity on retry", async () => {
  const { client, seen } = harness("admin");
  assert.deepEqual(await client.saveChapter!("biologi-dasar").submit(draft, requestId, signal), { status: "saved" });
  assert.deepEqual(await client.saveChapter!("biologi-dasar").submit(draft, requestId, signal), { status: "saved" });
  assert.deepEqual(await client.saveChapter!("biologi-dasar", "chapter+2").submit(draft, "chapter-second-request", signal), { status: "saved" });
  assert.deepEqual(seen.map((entry) => [entry.slug, entry.chapterId, entry.requestId, entry.body, entry.userId]), [
    ["biologi-dasar", undefined, requestId, draft, "local-admin"],
    ["biologi-dasar", undefined, requestId, draft, "local-admin"],
    ["biologi-dasar", "chapter+2", "chapter-second-request", draft, "local-admin"],
  ]);
  assert.deepEqual(await client.saveChapter!("biologi-dasar", "foreign").submit(draft, requestId, signal), { status: "missing" });
  assert.deepEqual(await client.saveChapter!("biologi-dasar", "stale").submit(draft, requestId, signal), { status: "conflict" });
});

test("chapter commands reject invalid paths and draft data before any write", async () => {
  const { send, seen } = harness("admin");
  assert.equal((await send("POST", base, draft, requestId, "https://another.invalid")).status, 403);
  assert.equal((await send("POST", base, draft, "short")).status, 400);
  assert.equal((await send("POST", base, { ...draft, title: " " })).status, 422);
  assert.equal((await send("POST", base, { ...draft, expectedRevision: "stale" })).status, 422);
  assert.equal((await send("POST", base, { ...draft, courseId: "other" })).status, 422);
  assert.equal((await send("PATCH", base, draft)).status, 404);
  assert.equal((await send("POST", base + "/chapter", draft)).status, 404);
  assert.equal((await send("PATCH", base + "/a%2Fb", draft)).status, 400);
  assert.equal((await harness("tutor").send("POST", base, draft)).status, 403);
  assert.equal((await harness(null).send("POST", base, draft)).status, 401);
  assert.deepEqual(seen, []);
});

test("archive requires confirmation and reorder submits exact ordered chapter ids", async () => {
  const { send, client, structure } = harness("admin");
  const { expectedRevision } = draft;
  const chapterId = "chapter+2";
  assert.equal((await send("DELETE", base + "/chapter%2B2", { expectedRevision, confirmed: false })).status, 422);
  assert.equal((await send("POST", base + "/order", { expectedRevision, chapterIds: [chapterId, chapterId] })).status, 422);
  assert.equal((await harness("tutor").send("DELETE", base + "/chapter%2B2", { expectedRevision, confirmed: true })).status, 403);
  assert.deepEqual(structure, []);
  const approval = { expectedRevision, confirmed: true as const };
  const order = { expectedRevision, chapterIds: [chapterId, "chapter-1"] };
  const target = client.reorderChapters!("biologi-dasar");
  assert.deepEqual(await client.archiveChapter!("biologi-dasar", chapterId).submit(approval, requestId, signal), { status: "saved" });
  assert.deepEqual(await target.submit(order, requestId, signal), { status: "saved" });
  const recovered = target.pending()!;
  recovered.draft.chapterIds.reverse();
  assert.deepEqual(await target.submit(recovered.draft, requestId, signal), { status: "retry" });
  assert.deepEqual(await target.submit(target.pending()!.draft, requestId, signal), { status: "saved" });
  assert.deepEqual(structure, [
    ["archive", "biologi-dasar", chapterId, approval, requestId],
    ["reorder", "biologi-dasar", order, requestId],
    ["reorder", "biologi-dasar", order, requestId],
  ]);
});

test("accepted chapter creation is recovered after the first dialog loses its response and remounts", async () => {
  const courseId = "canonical-bio";
  const path = `/api/native/academic/admin/courses/${courseId}/chapters`;
  const accepted = new Set<string>();
  const attempts: { id: string; data: unknown }[] = [];
  const firstScreen = new AbortController();
  let currentRevision = draft.expectedRevision;
  let commits = 0;
  const transport: AcademicTransport = {
    accountId: "local-admin", origin, locale: "id",
    async get(path) {
      assert.equal(path, "/api/native/academic/admin/courses/biologi-dasar");
      return Response.json({ course: { id: courseId, slug: "biologi-dasar" }, chapterEdit: { revision: currentRevision } });
    },
    async command(target, input, callSignal) {
      assert.equal(target, path);
      assert.equal(input.method, "POST");
      attempts.push({ id: input.requestId, data: input.body });
      if (!accepted.has(input.requestId)) {
        assert.equal((input.body as AdminChapterDraft).expectedRevision, currentRevision);
        commits++;
        accepted.add(input.requestId);
        currentRevision = "b".repeat(64);
      }
      if (callSignal === firstScreen.signal) {
        firstScreen.abort();
        callSignal.throwIfAborted();
      }
      return Response.json({ status: "saved", requestId: input.requestId });
    },
  };
  const previous = createAcademicClient(transport).saveChapter!(courseId);
  assert.deepEqual(await previous.submit(draft, requestId, firstScreen.signal), { status: "retry" });
  assert.equal(firstScreen.signal.aborted, true);

  const clientAfterNavigation = createAcademicClient(transport);
  const fresh = await clientAfterNavigation.course("biologi-dasar", signal);
  const reopened = clientAfterNavigation.saveChapter!(fresh.course.id);
  const pending = reopened.pending();
  assert.deepEqual(pending, { requestId, draft, confirmed: false });
  assert.equal(fresh.chapterEdit?.revision, "b".repeat(64));
  assert.equal(clientAfterNavigation.saveChapter!("another-course").pending(), null);
  assert.equal(clientAfterNavigation.saveChapter!(courseId, "existing-chapter").pending(), null);
  assert.equal(clientAfterNavigation.updateCourseSettings!(courseId).pending(), null);
  assert.equal(createAcademicClient({ ...transport, accountId: "different-admin" }).saveChapter!(courseId).pending(), null);
  assert.equal(createAcademicClient({ ...transport }).saveChapter!(courseId).pending(), null);

  reopened.acknowledge(requestId);
  assert.equal(reopened.pending()?.requestId, requestId);
  assert.deepEqual(await reopened.submit({ ...draft, expectedRevision: fresh.chapterEdit!.revision }, "new-key-after-remount", signal), { status: "retry" });
  assert.deepEqual(attempts, [{ id: requestId, data: draft }]);
  assert.deepEqual(await reopened.submit(pending!.draft, pending!.requestId, signal), { status: "saved" });
  assert.equal(commits, 1);
  assert.deepEqual(attempts, [{ id: requestId, data: draft }, { id: requestId, data: draft }]);
  const afterSecondRemount = createAcademicClient(transport).saveChapter!(courseId);
  assert.equal(afterSecondRemount.pending()?.confirmed, true);
  afterSecondRemount.acknowledge("unrelated-request");
  assert.equal(afterSecondRemount.pending()?.requestId, requestId);
  afterSecondRemount.acknowledge(requestId);
  assert.equal(afterSecondRemount.pending(), null);
});
