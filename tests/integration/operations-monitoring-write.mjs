import assert from "node:assert/strict";
import { mock } from "bun:test";

let authorization = { ok: false, status: 401 };
const calls = [];
mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db: {} }));
mock.module("@/lib/i18n/server", () => ({ getTranslations: async () => key => key }));
mock.module("@/lib/ai/model-settings-store", () => ({ listModelSettingViews: async () => [] }));
mock.module("@/lib/auth/native-operations-admin", () => ({
  getNativeOperationsAdmin: async () => authorization,
}));
mock.module("@/app/api/admin/short-links/route", () => ({
  async POST(request) {
    calls.push(await request.json());
    return Response.json({ id: "fixture-link" }, { status: 201 });
  },
}));

const { POST } = await import("../../app/api/admin/native-monitoring/route");
const origin = "https://example.invalid";
const url = `${origin}/api/admin/native-monitoring?view=links`;
const draft = { url: "https://example.invalid/intro", title: "Pengantar", slug: "" };
const post = (body = draft, requestOrigin = origin) => POST(new Request(url, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: requestOrigin },
  body: JSON.stringify(body),
}));

assert.equal((await post()).status, 401);
authorization = { ok: false, status: 403 };
assert.equal((await post()).status, 403);
authorization = { ok: true, user: { id: "fixture-admin" } };
assert.equal((await post(draft, "https://other.example.invalid")).status, 403);
assert.equal((await post({ ...draft, url: "file:///etc/passwd" })).status, 400);
assert.equal((await post({ ...draft, url: "https://secret@example.invalid" })).status, 400);
assert.equal((await post({ ...draft, slug: "../../other" })).status, 400);
assert.deepEqual(calls, []);
const created = await post();
assert.equal(created.status, 201);
assert.equal(created.headers.get("cache-control"), "private, no-store");
assert.deepEqual(await created.json(), { id: "fixture-link" });
assert.deepEqual(calls, [draft]);
console.log("monitoring write gate passed authorization, origin, schema and delegated request checks");
