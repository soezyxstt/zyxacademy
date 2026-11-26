import assert from "node:assert/strict";
import test from "node:test";
import { createAcademicClient, type AcademicCommand } from "../../../../apps/mobile-native/features/academic/client";
import { handleAdminCourseSettingsCommand } from "../../../../lib/native/academic/course-settings-command";
import type { AdminCourseEditDraft } from "./edit-contract";

const origin = "https://academic.invalid";
const path = "/api/native/academic/admin/courses/biologi-dasar/settings";
const requestId = "native-test-command-id";
const revision = "a".repeat(64);
const signal = new AbortController().signal;
const form: AdminCourseEditDraft = { title: "Biologi Molekuler", category: "Biologi", description: null, expectedRevision: revision };

function harness(role: "admin" | "tutor" | null) {
  const observed: { slug: string; draft: AdminCourseEditDraft; id: string; actor: string }[] = [];
  const receipts = new Map<string, string>();
  let current = revision;
  let commits = 0;
  const dispatch = async (target: string, body: unknown, id?: string, requestOrigin = origin) => {
    const headers = new Headers({ Origin: requestOrigin, "Content-Type": "application/json" });
    if (id) headers.set("Idempotency-Key", id);
    return handleAdminCourseSettingsCommand(
      new Request(origin + target, { method: "PATCH", headers, body: JSON.stringify(body) }),
      target.split("/").slice(4).map(decodeURIComponent),
      origin,
      {
        session: async () => role ? { user: { id: "actor-1" }, session: { id: "session-1" } } : null,
        hasAdmin: async (id) => id === "actor-1" && role === "admin",
        update: async (slug, draft, id, viewer) => {
          observed.push({ slug, draft, id, actor: viewer.user.id });
          if (slug !== "biologi-dasar") throw new Error("COURSE_NOT_FOUND");
          const body = JSON.stringify(draft);
          if (receipts.get(id) === body) return;
          if (receipts.has(id)) throw new Error("REQUEST_CONFLICT");
          if (current !== draft.expectedRevision) throw new Error("REVISION_CONFLICT");
          receipts.set(id, body);
          commits++;
          current = "b".repeat(64);
        },
      },
    );
  };
  const attempts: AcademicCommand[] = [];
  const native = createAcademicClient({
    origin, accountId: "actor-1", locale: "id",
    async get() { throw new Error("Unexpected GET"); },
    async command(target, input, requestSignal) {
      requestSignal.throwIfAborted();
      attempts.push(input);
      return dispatch(target, input.body, input.requestId);
    },
  });
  return { native, dispatch, observed, attempts, commits: () => commits };
}

test("course command sends exact request ID and revision through admin session", async () => {
  const { native, observed, commits, attempts } = harness("admin");
  const update = native.updateCourseSettings!("biologi-dasar");
  for (let repeat = 0; repeat < 2; repeat++) {
    assert.deepEqual(await update.submit(form, requestId, signal), { status: "saved" });
  }
  assert.deepEqual(attempts, [
    { method: "PATCH", body: form, requestId },
    { method: "PATCH", body: form, requestId },
  ]);
  assert.equal(commits(), 1);
  assert.equal(observed[0].actor, "actor-1");
  update.acknowledge(requestId);
  assert.deepEqual(await update.submit({ ...form, title: "Biologi Seluler" }, requestId, signal), { status: "conflict" });
  assert.deepEqual(await update.submit(form, "second-native-course-request", signal), { status: "conflict" });
  assert.deepEqual(await native.updateCourseSettings!("fisika-dasar").submit(form, "third-native-course-request", signal), { status: "missing" });
});

test("course command rejects cross-origin, unprivileged, malformed and incompatible changes", async () => {
  const { dispatch, observed } = harness("admin");
  assert.equal((await dispatch(path, form, requestId, "https://foreign.invalid")).status, 403);
  assert.equal((await dispatch(path, form)).status, 400);
  assert.equal((await dispatch(path, { ...form, category: "Invalid" }, requestId)).status, 422);
  assert.equal((await dispatch(path, { ...form, title: " " }, requestId)).status, 422);
  assert.equal((await dispatch(path, { ...form, isDemo: true }, requestId)).status, 422);
  assert.equal((await dispatch(path.replace("biologi-dasar", "foreign%2Fcourse"), form, requestId)).status, 400);
  assert.equal((await dispatch(path.replace("settings", "analytics"), form, requestId)).status, 404);
  assert.equal((await harness("tutor").dispatch(path, form, requestId)).status, 403);
  assert.equal((await harness(null).dispatch(path, form, requestId)).status, 401);
  assert.deepEqual(observed, []);
});
