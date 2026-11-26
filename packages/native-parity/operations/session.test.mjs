import assert from "node:assert/strict";
import test from "node:test";
import { operationsAccountKey, createEvaluationRequest } from "../../../apps/mobile-native/features/operations/session";
import { createNativeTransport } from "../../../apps/mobile-native/network/transport";
import { operationsCases } from "./cases";
import { resolveOperationsArea } from "../../../apps/mobile-native/features/operations/routes";

test("case IDs uniquely address the three operations fixtures per route", () => {
  assert.equal(operationsCases.length, 147);
  assert.equal(new Set(operationsCases.map(c => c.id)).size, 147);
  for (const fixture of operationsCases) {
    assert.match(fixture.id, /^operations-/);
    assert.ok(resolveOperationsArea(fixture.path), fixture.path);
  }
});

test("evaluation transport preserves status and never replays a mutation", async () => {
  const calls = [];
  const origin = "https://example.invalid";
  const factory = createNativeTransport({ origin, fetcher: async (url, init) => {
    calls.push({ url, init });
    return Response.json({}, { status: 503 });
  } });
  const scope = { origin, accountId: "operations-user", sessionId: "operations-session" };
  const session = factory.setSession({ ...scope, readCookie: () => "synthetic=1" });
  const context = { ...scope, roles: ["admin"], dashboard: "/admin", locale: "id" };
  assert.ok(operationsAccountKey(session, context));
  assert.throws(() => operationsAccountKey(session, { ...context, sessionId: "expired" }));
  const request = createEvaluationRequest(session);
  await assert.rejects(request("/api/native/operations/evaluation/actions?action=jobs", { method: "POST", body: { courseId: "fixture" } }), { status: 503 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.body, '{"courseId":"fixture"}');
  factory.clearSession();
  assert.throws(() => operationsAccountKey(session, context));
  await assert.rejects(request("/api/native/operations/evaluation?href=/admin/jobs"));
  assert.equal(calls.length, 1);
});
