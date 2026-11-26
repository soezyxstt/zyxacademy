import assert from "node:assert/strict";
import test from "node:test";
import {
  activityOutcomes, aiDateRange, filterAiRequests, isMonitoringPath, monitoringPaths, monitoringResultMatches, swapModelPriority,
} from "./monitoring-contract.ts";
import { createMonitoringFixture, monitoringCases, monitoringFixtureData } from "./monitoring-fixtures.ts";
import { createMonitoringReader, createSessionMonitoringActions, createSessionMonitoringReader } from "../../../apps/mobile-native/features/operations/monitoring/transport.ts";

const signal = () => new AbortController().signal;

test("monitoring owns ten routes with three unique named cases each", () => {
  assert.equal(monitoringPaths.length, 10);
  assert.equal(new Set(monitoringCases.map(item => item.id)).size, 30);
  for (const path of monitoringPaths) {
    assert.ok(isMonitoringPath(path));
    assert.equal(monitoringCases.filter(item => item.path === path).length, 3);
  }
  assert.equal(isMonitoringPath("/admin/tautan"), false);
});

test("web analytics and learner activity remain separate sources with distinct empty states", async () => {
  const { reader } = createMonitoringFixture();
  const web = await reader.read({ view: "web" }, signal());
  const featureUsage = await reader.read({ view: "features", range: 30 }, signal());
  const noActivity = await reader.read({ view: "features", range: 7 }, signal());
  assert.equal(web.summary.views, 2524);
  assert.deepEqual(web.topPages.slice(0, 2).map(page => page.path), ["/", "/blog"]);
  assert.equal(featureUsage.totals.activeUsers, 12);
  assert.equal(noActivity.totals.activeUsers, 0);
  assert.equal(noActivity.totals.topFeatureKey, null);
  assert.equal((await reader.read({ view: "usage", range: 7 }, signal())).users.length, 0);
  assert.equal((await createMonitoringFixture("unavailable").reader.read({ view: "web" }, signal())), null);
  assert.equal((await createMonitoringFixture("empty").reader.read({ view: "web" }, signal())).summary.views, 0);
});

test("filters use gateway attribution and tutor audit outcomes independently", async () => {
  const { reader } = createMonitoringFixture();
  const ai = await reader.read({ view: "ai" }, signal());
  assert.equal(filterAiRequests(ai.recentLogs, "gateway").length, 3);
  assert.equal(filterAiRequests(ai.recentLogs, "failed").length, 1);
  assert.equal(activityOutcomes.includes("failed"), true);
  const first = await reader.read({ view: "tutor", filters: { limit: 1 } }, signal());
  const second = await reader.read({ view: "tutor", filters: { limit: 1 }, cursor: first.page.nextCursor }, signal());
  assert.notEqual(first.page.items[0].id, second.page.items[0].id);
  const filtered = await reader.read({ view: "tutor", filters: { outcome: "rejected", actorId: "tutor-raka" } }, signal());
  assert.deepEqual(filtered.page.items.map(item => item.id), ["audit-2"]);
  assert.deepEqual(filtered.stats, first.stats);
  const detail = await reader.read({ view: "tutorDetail", id: filtered.page.items[0].id }, signal());
  assert.equal(detail.correlationId, "req-delete");
});

test("403 is distinct from retryable read errors and data stays hidden after a reader switch", async () => {
  const stale = createMonitoringFixture().reader;
  const denied = createMonitoringFixture("denied").reader;
  const query = JSON.stringify({ view: "web" });
  const previous = { reader: stale, query, data: await stale.read({ view: "web" }, signal()) };
  assert.equal(monitoringResultMatches(previous, stale, query), true);
  assert.equal(monitoringResultMatches(previous, denied, query), false);
  assert.equal(monitoringResultMatches(previous, stale, JSON.stringify({ view: "home" })), false);
  await assert.rejects(denied.read({ view: "web" }, signal()), { status: 403 });
  const retryable = createMonitoringFixture("retry").reader;
  await assert.rejects(retryable.read({ view: "web" }, signal()), { status: 503 });
  assert.equal((await retryable.read({ view: "web" }, signal())).summary.views, previous.data.summary.views);
});

test("read adapter preserves the actual windows, source paths and cursor identity", async () => {
  const calls = [];
  const now = new Date("2026-11-26T06:00:00.000Z");
  const reader = createMonitoringReader(async (path, init) => {
    calls.push({ path, init });
    return Response.json(path.includes("view=usage") ? { success: true, data: monitoringFixtureData.usage } : {});
  }, "en", () => now);
  const cursor = { id: "audit record 1", createdAt: now.toISOString() };
  const requestSignal = signal();
  await reader.read({ view: "web", range: 7 }, requestSignal);
  await reader.read({ view: "features", range: 7 }, requestSignal);
  await reader.read({ view: "usage", range: 90 }, requestSignal);
  await reader.read({ view: "tutor", cursor, filters: { correlationId: "request?=A" } }, requestSignal);
  await reader.read({ view: "offlineCatalog", id: "course?A" }, requestSignal);
  const requests = calls.map(({ path }) => new URL(path, "https://example.invalid"));
  assert.equal(requests[0].pathname, "/api/admin/native-monitoring");
  assert.equal(requests[0].searchParams.get("view"), "web");
  assert.equal(requests[1].searchParams.get("range"), "7");
  assert.equal(requests[2].pathname, "/api/admin/native-monitoring");
  assert.equal(requests[2].searchParams.get("view"), "usage");
  for (const [key, value] of aiDateRange(90, now)) assert.equal(requests[2].searchParams.get(key), value);
  assert.equal(requests[3].searchParams.get("correlationId"), "request?=A");
  assert.equal(requests[3].searchParams.get("cursorId"), cursor.id);
  assert.equal(requests[3].searchParams.get("cursorAt"), cursor.createdAt);
  assert.equal(requests[4].searchParams.get("locale"), "en");
  assert.equal(requests[4].searchParams.get("courseId"), "course?A");
  for (const call of calls) {
    assert.equal(call.init.signal, requestSignal);
    assert.equal(call.init.headers["Accept-Language"], "en");
    assert.equal(call.init.method, undefined);
  }
});

test("fixture writes preserve identities, conflicts and proposal sequencing", async () => {
  const { reader, actions } = createMonitoringFixture();
  const isolated = createMonitoringFixture();
  const initial = await reader.read({ view: "offline" }, signal());
  const { revision, updatedAt, ...policy } = initial.policy;
  await actions.saveOffline({ expectedRevision: revision, policy: { ...policy, wifiOnly: true } });
  await assert.rejects(actions.saveOffline({ expectedRevision: revision, policy }), { status: 409 });
  assert.equal((await reader.read({ view: "offline" }, signal())).policy.wifiOnly, true);
  assert.equal((await isolated.reader.read({ view: "offline" }, signal())).policy.wifiOnly, false);
  const [model] = await reader.read({ view: "models" }, signal());
  const models = swapModelPriority(model.models, 0, model.models[1]);
  assert.deepEqual(models, [model.models[1], model.models[0], model.models[2]]);
  await actions.saveModel({ feature: model.feature, expectedUpdatedAt: model.updatedAt, models });
  await assert.rejects(actions.resetModel({ feature: model.feature, expectedUpdatedAt: model.updatedAt }), { status: 409 });
  const [proposal] = (await reader.read({ view: "proposals" }, signal())).proposals;
  const identity = { id: proposal.id, preconditionVersion: proposal.preconditionVersion };
  await assert.rejects(actions.transitionProposal({ ...identity, action: "confirm" }), { status: 409 });
  await actions.transitionProposal({ ...identity, action: "review" });
  await actions.transitionProposal({ ...identity, action: "confirm" });
  assert.equal((await reader.read({ view: "proposals" }, signal())).proposals[0].status, "confirmed");
  await actions.createLink({ url: "https://example.invalid", title: null, slug: "new-link" });
  await assert.rejects(actions.createLink({ url: "https://example.invalid", title: null, slug: "new-link" }), { status: 409 });
  assert.equal((await reader.read({ view: "links" }, signal()))[0].slug, "new-link");
});

test("session adapter disposes responses, checks current identity and keeps writes single-attempt", async () => {
  const calls = [];
  let disposals = 0;
  let current = true;
  const session = {
    scope: { origin: "https://example.invalid", accountId: "fixture-admin", sessionId: "fixture-session" },
    async request(path, init) {
      calls.push({ path, init });
      const failed = path === "/api/admin/native-monitoring?view=links";
      return {
        ok: !failed, status: failed ? 409 : 200,
        json: async () => { current = false; return monitoringFixtureData.web; },
        dispose() { disposals += 1; },
      };
    },
    assertCurrent() { if (!current) throw new Error("Stale account"); },
  };
  const reader = createSessionMonitoringReader(session, "id");
  await assert.rejects(reader.read({ view: "web" }, signal()), /Stale account/);
  const actions = createSessionMonitoringActions(session);
  await assert.rejects(actions.createLink({ slug: "a", url: "https://example.invalid", title: null }), { status: 409 });
  current = true;
  await actions.revalidateOffline({ scope: "all" });
  assert.equal(disposals, 3);
  assert.deepEqual(calls.map(call => [call.path, call.init.method]), [
    ["/api/admin/native-monitoring?view=web", undefined],
    ["/api/admin/native-monitoring?view=links", "POST"],
    ["/api/admin/offline/revalidate", "POST"],
  ]);
  assert.equal(calls[2].init.headers.get("x-offline-account-id"), "fixture-admin");
  assert.equal(calls[2].init.headers.get("x-offline-session-id"), "fixture-session");
  for (const { init } of calls.slice(1)) {
    assert.equal(init.retry, undefined);
    assert.equal(init.headers.get("Origin"), session.scope.origin);
  }
});
