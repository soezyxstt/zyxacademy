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

test("blocks a fourth dispatch for five minutes, isolates aliases and resets after a success", async () => {
  let now = 1000, calls = 0;
  spyOn(Date, "now").mockImplementation(() => now);
  const invoke = async () => { calls++; return false; };
  for (let index = 0; index < 3; index++) await withGatewayAlias(env, "openai", "openai_1", invoke, value => value);
  await expect(withGatewayAlias(env, "openai", "openai_1", invoke, value => value)).rejects.toBeInstanceOf(GatewayAliasCooldownError);
  expect(calls).toBe(3);
  await withGatewayAlias(env, "openai", "openai_2", async () => true, value => value);
  now += 5 * 60_000;
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
  const health = spyOn(ControlPlaneClient.prototype, "aliasHealth").mockResolvedValue({ failures: 3, cooldownUntil: Date.now() + 5 * 60_000 });
  const request = spyOn(globalThis, "fetch");
  await expect(prepareGoogleGatewayClient("fixture", projected, undefined, {}, { preferByokAlias: "gemini_1" })).rejects.toBeInstanceOf(GatewayAliasCooldownError);
  expect(health).toHaveBeenCalledTimes(1); expect(request).not.toHaveBeenCalled();
});

test("rejected model requests, rate limits, upstream 5xx, and timeouts leave the alias available", async () => {
  const { generationAliasOutcome } = await import("@/lib/ai/provider/alias-health");
  for (const status of [400, 404, 413, 415, 422, 429, 500, 502, 503, 504, 200]) {
    const response = await withGatewayAlias(env, "muse", "muse_1",
      async () => new Response("{}", { status }), generationAliasOutcome);
    expect(response.status).toBe(status);
  }
  for (let i = 0; i < 4; i++) {
    const timeout = new DOMException("The operation timed out", "TimeoutError");
    await expect(withGatewayAlias(env, "muse", "muse_1", async () => { throw timeout; }, generationAliasOutcome)).rejects.toThrow();
  }
  const ok = await withGatewayAlias(env, "muse", "muse_1", async () => new Response("{}", { status: 200 }), generationAliasOutcome);
  expect(ok.status).toBe(200);
});

test("repeated 401/403 responses still cool down the failing BYOK alias", async () => {
  const { generationAliasOutcome } = await import("@/lib/ai/provider/alias-health");
  for (let i = 0; i < 3; i++) {
    const res = await withGatewayAlias(env, "openai", "openai_auth_bad",
      async () => new Response("{}", { status: 401 }), generationAliasOutcome);
    expect(res.status).toBe(401);
  }
  await expect(withGatewayAlias(env, "openai", "openai_auth_bad",
    async () => new Response("{}", { status: 200 }), generationAliasOutcome)).rejects.toBeInstanceOf(GatewayAliasCooldownError);
});

test("legacy 24-hour cooldowns returned by an older control plane normalize to the 5-minute window", async () => {
  const configured = { ...env, ZYRA_CONTROL_PLANE_URL: "https://control.fixture", ZYRA_CONTROL_PLANE_TOKEN: "fixture" };
  const now = Date.now();
  const legacyCooldownMs = 24 * 60 * 60_000;
  // Started 2 minutes ago under legacy 24h TTL -> still within 5-minute cooldown
  const recentLegacy = now - 2 * 60_000 + legacyCooldownMs;
  const healthSpy = spyOn(ControlPlaneClient.prototype, "aliasHealth").mockResolvedValue({ failures: 3, cooldownUntil: recentLegacy });
  await expect(withGatewayAlias(configured, "openai", "openai_legacy_recent", async () => "ok", () => true))
    .rejects.toBeInstanceOf(GatewayAliasCooldownError);

  // Started 10 minutes ago under legacy 24h TTL -> expired under 5-minute cooldown
  const expiredLegacy = now - 10 * 60_000 + legacyCooldownMs;
  healthSpy.mockResolvedValue({ failures: 3, cooldownUntil: expiredLegacy });
  spyOn(ControlPlaneClient.prototype, "recordAliasAttempt").mockResolvedValue({ failures: 0, cooldownUntil: 0 });
  expect(await withGatewayAlias(configured, "openai", "openai_legacy_expired", async () => "recovered", () => true))
    .toBe("recovered");
});

test("caches confirmed-healthy alias checks briefly and decays stale local failures after 10 minutes", async () => {
  const configured = { ...env, ZYRA_CONTROL_PLANE_URL: "https://control.fixture", ZYRA_CONTROL_PLANE_TOKEN: "fixture" };
  let now = 50_000;
  spyOn(Date, "now").mockImplementation(() => now);
  const healthSpy = spyOn(ControlPlaneClient.prototype, "aliasHealth").mockResolvedValue({ failures: 0, cooldownUntil: 0 });
  spyOn(ControlPlaneClient.prototype, "recordAliasAttempt").mockResolvedValue({ failures: 0, cooldownUntil: 0 });

  await withGatewayAlias(configured, "openai", "openai_cached", async () => "ok", () => true);
  now += 5_000;
  await withGatewayAlias(configured, "openai", "openai_cached", async () => "ok", () => true);
  expect(healthSpy).toHaveBeenCalledTimes(1);

  now += 10_001;
  await withGatewayAlias(configured, "openai", "openai_cached", async () => "ok", () => true);
  expect(healthSpy).toHaveBeenCalledTimes(2);

  // Local failure decay after 10 minutes prevents sporadic failures from opening cooldown
  await withGatewayAlias(env, "muse", "muse_decay", async () => false, value => value);
  await withGatewayAlias(env, "muse", "muse_decay", async () => false, value => value);
  now += 10 * 60_000 + 1;
  await withGatewayAlias(env, "muse", "muse_decay", async () => false, value => value);
  expect(await withGatewayAlias(env, "muse", "muse_decay", async () => "still-open", () => true)).toBe("still-open");
});
