import { beforeEach, expect, mock, test } from "bun:test";
let authorized = true;
const list = mock(async () => []);
const send = mock(async (_event: { name: string; id: string; data: { requestId: string } }) => ({ ids: ["fixture"] }));
mock.module("next/cache", () => ({ revalidatePath() {} }));
mock.module("@/lib/auth/admin-guards", () => ({ assertAdmin: async () => {
  if (!authorized) throw new Error("Forbidden");
  return { user: { id: "admin-fixture" } };
} }));
mock.module("@/lib/ai/model-settings-store", () => ({
  ModelSettingConflictError: class extends Error {}, listModelSettingViews: list,
  resetModelSetting: async () => {}, saveModelSetting: async () => {},
}));
mock.module("@/jobs/client", () => ({ inngest: { send } }));
const { listAiModelSettingsAction, refreshAiModelLatenciesAction } = await import("@/app/(admin)/admin/ops/models/actions");
beforeEach(() => {
  authorized = true; list.mockClear(); send.mockClear();
  Object.assign(process.env, { ZYRA_CONTROL_PLANE_URL: "https://fixture.test", ZYRA_CONTROL_PLANE_TOKEN: "fixture",
    CF_KV_NAMESPACE_ID: "fixture", CF_ACCOUNT_ID: "fixture", CF_API_TOKEN: "fixture" });
});
test("reading observations never forces model discovery or enqueues probes", async () => {
  expect((await listAiModelSettingsAction()).ok).toBe(true);
  expect(list.mock.calls).toEqual([[]]); expect(send).not.toHaveBeenCalled();
});
test("manual refresh enqueues an identified latency job and leaves the catalog cached", async () => {
  const result = await refreshAiModelLatenciesAction();
  expect(result.ok && result.latencyRefreshRequestedAt).toBeGreaterThan(0);
  expect(list.mock.calls).toEqual([[]]);
  const payload = send.mock.calls[0][0];
  expect(payload.name).toBe("ai-model-catalog-cron");
  expect(payload.id).toBe(payload.data.requestId);
  expect(payload.id).toMatch(/^[0-9a-f-]{36}$/);
});
test("only admins with probe bindings can enqueue latency work", async () => {
  authorized = false;
  expect((await refreshAiModelLatenciesAction()).ok).toBe(false);
  authorized = true; delete process.env.ZYRA_CONTROL_PLANE_TOKEN;
  expect((await refreshAiModelLatenciesAction()).ok).toBe(false);
  expect(send).not.toHaveBeenCalled(); expect(list).not.toHaveBeenCalled();
});
