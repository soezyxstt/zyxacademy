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

let syncSuccess = false;
let latencyAllowed = false;
let modelConflict = false;
const modelCalls = [];
const proposals = [];
mock.module("@/app/api/admin/analytics/sync/route", () => ({
  POST: async () => Response.json({ success: syncSuccess, count: 4 }),
}));
mock.module("@/app/(admin)/admin/ops/models/actions", () => ({
  updateAiModelSettingAction: async input => {
    modelCalls.push(input);
    return modelConflict ? { ok: false, code: "MODEL_SETTING_CONFLICT", error: "Conflict" } : { ok: true };
  },
  resetAiModelSettingAction: async input => { modelCalls.push(input); return { ok: true }; },
  refreshAiModelLatenciesAction: async () => latencyAllowed
    ? { ok: true, latencyRefreshRequestedAt: 1234 }
    : { ok: false, code: "LATENCY_COOLDOWN", error: "Cooldown" },
}));
mock.module("@/app/api/zyra/proposals/route", () => ({
  POST: async request => { proposals.push(await request.json()); return Response.json({}, { status: 201 }); },
}));
mock.module("@/app/api/zyra/proposals/[id]/route", () => ({
  PATCH: async (request, { params }) => {
    proposals.push({ ...await params, ...await request.json() });
    return Response.json({});
  },
}));

const action = (name, input = {}) => POST(new Request(origin + "/api/admin/native-monitoring?view=" + name, {
  method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(input),
}));
assert.equal((await action("sync")).status, 502);
syncSuccess = true;
assert.deepEqual(await (await action("sync")).json(), { count: 4 });
assert.equal((await action("measureLatency")).status, 429);
latencyAllowed = true;
assert.equal((await action("measureLatency")).status, 200);
const model = { feature: "fixture", models: ["uno", "dos", "tres"], expectedUpdatedAt: null };
assert.equal((await action("saveModel", { ...model, models: [] })).status, 400);
assert.equal((await action("saveModel", model)).status, 200);
modelConflict = true;
assert.equal((await action("saveModel", model)).status, 409);
assert.equal((await action("resetModel", { feature: "fixture", expectedUpdatedAt: null })).status, 200);
assert.deepEqual(modelCalls[0], model);
assert.equal((await action("createProposal", { courseId: "outside" })).status, 400);
assert.equal((await action("createProposal")).status, 201);
const transition = { id: "fixture", preconditionVersion: 1, action: "review" };
assert.equal((await action("transitionProposal", { ...transition, action: "apply" })).status, 400);
assert.equal((await action("transitionProposal", transition)).status, 200);
assert.deepEqual(proposals[0].operations, [{ kind: "read_only_report", reportKey: "course_readiness" }]);
assert.deepEqual(proposals[1], transition);
authorization = { ok: false, status: 403 };
for (const name of ["sync", "measureLatency", "saveModel", "resetModel", "createProposal", "transitionProposal"]) {
  assert.equal((await action(name)).status, 403);
}
console.log("monitoring actions: authorization, validation, model conflicts, latency cooldown, sync failure and proposal transitions passed");
