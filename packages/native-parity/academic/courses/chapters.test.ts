import assert from "node:assert/strict";
import test from "node:test";
import { createAcademicClient } from "../../../../apps/mobile-native/features/academic/client";
import { handleAdminCourseChapterCommand } from "../../../../lib/native/academic/course-chapter-command";
import type { AdminChapterDraft } from "./edit-contract";

const origin = "https://academic.invalid";
const base = "/api/native/academic/admin/courses/biologi-dasar/chapters";
const requestId = "chapter-original-request";
const draft: AdminChapterDraft = { title: "Bab sel", description: "Organel", expectedRevision: "a".repeat(64) };
const signal = new AbortController().signal;

function harness(role: "admin" | "tutor" | null) {
  const seen: { slug: string; chapterId: string | undefined; requestId: string; body: AdminChapterDraft; userId: string }[] = [];
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
  return { send, client, seen };
}

test("chapter adapter uses distinct create and edit targets with the same request identity on retry", async () => {
  const { client, seen } = harness("admin");
  assert.deepEqual(await client.saveChapter!("biologi-dasar", undefined, draft, requestId, signal), { status: "saved" });
  assert.deepEqual(await client.saveChapter!("biologi-dasar", undefined, draft, requestId, signal), { status: "saved" });
  assert.deepEqual(await client.saveChapter!("biologi-dasar", "chapter+2", draft, "chapter-second-request", signal), { status: "saved" });
  assert.deepEqual(seen.map((entry) => [entry.slug, entry.chapterId, entry.requestId, entry.body, entry.userId]), [
    ["biologi-dasar", undefined, requestId, draft, "local-admin"],
    ["biologi-dasar", undefined, requestId, draft, "local-admin"],
    ["biologi-dasar", "chapter+2", "chapter-second-request", draft, "local-admin"],
  ]);
  assert.deepEqual(await client.saveChapter!("biologi-dasar", "foreign", draft, requestId, signal), { status: "missing" });
  assert.deepEqual(await client.saveChapter!("biologi-dasar", "stale", draft, requestId, signal), { status: "conflict" });
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
