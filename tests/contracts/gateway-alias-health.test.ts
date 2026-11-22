import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { withGatewayAlias, resetAliasHealthForTests, GatewayAliasCooldownError } from "@/lib/ai/provider/alias-health";
import { ControlPlaneClient } from "@/lib/ai/control-plane-client";
import { GatewayAliasLedger } from "@/workers/zyra-control-plane/src/quota/alias-health";
import { BunSqliteHarness } from "@/workers/zyra-control-plane/tests/sqlite-harness";
import { prepareGoogleGatewayClient } from "@/lib/ai/provider/google-gateway-client";
import { createZyraRuntimeEnv } from "@/lib/zyra/runtime-env";
const env = { CF_AI_GATEWAY_URL: "https://gateway.ai.cloudflare.com/v1/account/gateway" };
beforeEach(resetAliasHealthForTests);
afterEach(() => mock.restore());

test("blocks a fourth dispatch for one day, isolates aliases and resets after a success", async () => {
  let now = 1000, calls = 0;
  spyOn(Date, "now").mockImplementation(() => now);
  const invoke = async () => { calls++; return false; };
  for (let index = 0; index < 3; index++) await withGatewayAlias(env, "openai", "openai_1", invoke, value => value);
  await expect(withGatewayAlias(env, "openai", "openai_1", invoke, value => value)).rejects.toBeInstanceOf(GatewayAliasCooldownError);
  expect(calls).toBe(3);
  await withGatewayAlias(env, "openai", "openai_2", async () => true, value => value);
  now += 24 * 60 * 60_000;
  await withGatewayAlias(env, "openai", "openai_1", invoke, value => value);
  await withGatewayAlias(env, "openai", "openai_1", async () => true, value => value);
  await withGatewayAlias(env, "openai", "openai_1", invoke, value => value);
  expect(calls).toBe(5);
});

test("atomic shared receipts count concurrent failures once and survive a fresh process cache", async () => {
  const sql = new BunSqliteHarness(), ledger = new GatewayAliasLedger(sql);
  const configured = { ...env, ZYRA_CONTROL_PLANE_URL: "https://control.fixture", ZYRA_CONTROL_PLANE_TOKEN: "fixture" };
  spyOn(ControlPlaneClient.prototype, "aliasHealth").mockImplementation(async id => ledger.status(id));
  spyOn(ControlPlaneClient.prototype, "recordAliasAttempt").mockImplementation(async (id, attempt, success) => ledger.record(id, attempt, success));
  let calls = 0;
  const invoke = async () => { calls++; return false; };
  await Promise.all([1,2,3].map(() => withGatewayAlias(configured, "muse", "muse_1", invoke, value => value)));
  resetAliasHealthForTests();
  await expect(withGatewayAlias(configured, "muse", "muse_1", invoke, value => value)).rejects.toBeInstanceOf(GatewayAliasCooldownError);
  expect(calls).toBe(3);
  sql.close();
});

test("an unavailable health receipt cannot turn a successful billed response into a retry", async () => {
  const configured = { ...env, ZYRA_CONTROL_PLANE_URL: "https://control.fixture", ZYRA_CONTROL_PLANE_TOKEN: "fixture" };
  spyOn(ControlPlaneClient.prototype, "aliasHealth").mockRejectedValue(new Error("offline"));
  spyOn(ControlPlaneClient.prototype, "recordAliasAttempt").mockRejectedValue(new Error("offline"));
  let calls = 0;
  expect(await withGatewayAlias(configured, "gemini", "gemini_1", async () => { calls++; return "answer"; }, () => true)).toBe("answer");
  expect(calls).toBe(1);
});

test("the projected Gemini web environment checks shared cooldown before preparing a client", async () => {
  const projected = createZyraRuntimeEnv({ ...env, CF_AI_GATEWAY_TOKEN: "fixture", ZYRA_CONTROL_PLANE_URL: "https://control.fixture", ZYRA_CONTROL_PLANE_TOKEN: "fixture" });
  const health = spyOn(ControlPlaneClient.prototype, "aliasHealth").mockResolvedValue({ failures: 3, cooldownUntil: Date.now() + 86400000 });
  const request = spyOn(globalThis, "fetch");
  await expect(prepareGoogleGatewayClient("fixture", projected, undefined, {}, { preferByokAlias: "gemini_1" })).rejects.toBeInstanceOf(GatewayAliasCooldownError);
  expect(health).toHaveBeenCalledTimes(1); expect(request).not.toHaveBeenCalled();
});
