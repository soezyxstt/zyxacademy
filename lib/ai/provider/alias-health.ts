import { createHash, randomUUID } from "node:crypto";
import { ControlPlaneClient } from "../control-plane-client";
import { ProviderAdapterError } from "./errors";

const DAY_MS = 24 * 60 * 60_000;
const local = new Map<string, { failures: number; cooldownUntil: number }>();
export function resetAliasHealthForTests() { local.clear(); }
function identity(env: Readonly<Record<string, string | undefined>>, route: string, alias: string) {
  return createHash("sha256").update(JSON.stringify([env.CF_AI_GATEWAY_URL, route, alias])).digest("hex");
}
export function aliasCooldownUntil(env: Readonly<Record<string, string | undefined>>, route: string, alias: string) {
  return local.get(identity(env, route, alias))?.cooldownUntil ?? 0;
}
export class GatewayAliasCooldownError extends ProviderAdapterError {
  constructor() { super({ code: "PROVIDER_AUTHENTICATION", message: "AI Gateway alias is cooling down", retryClassification: "authentication" }); }
}

export async function withGatewayAlias<T>(
  env: Readonly<Record<string, string | undefined>>, route: string, alias: string,
  invoke: () => Promise<T>, succeeded: (result: T) => boolean,
): Promise<T> {
  const id = identity(env, route, alias);
  const control = env.ZYRA_CONTROL_PLANE_URL && env.ZYRA_CONTROL_PLANE_TOKEN
    ? new ControlPlaneClient({ baseUrl: env.ZYRA_CONTROL_PLANE_URL, token: env.ZYRA_CONTROL_PLANE_TOKEN }) : undefined;
  let state = local.get(id) ?? { failures: 0, cooldownUntil: 0 };
  // shortcut: without a reachable control plane, protection is process-local; configure it for shared cooldowns.
  if (control) { try { state = await control.aliasHealth(id); local.set(id, state); } catch { /* Keep local protection if health storage is unreachable. */ } }
  if (state.cooldownUntil > Date.now()) throw new GatewayAliasCooldownError();
  if (state.cooldownUntil) { state = { failures: 0, cooldownUntil: 0 }; local.set(id, state); }
  const attemptId = randomUUID();
  const record = async (success: boolean) => {
    if (control) {
      try { local.set(id, await control.recordAliasAttempt(id, attemptId, success)); return; }
      catch { /* Never hide a provider result because its health receipt failed. */ }
    }
    // Read the latest local outcome so parallel completions cannot overwrite a failure count.
    const previous = local.get(id) ?? state;
    if (previous.cooldownUntil > Date.now()) return;
    const failures = success ? 0 : previous.failures + 1;
    const next = { failures, cooldownUntil: failures >= 3 ? Date.now() + DAY_MS : 0 };
    local.set(id, next);
  };
  let result: T;
  try { result = await invoke(); } catch (error) { await record(false); throw error; }
  await record(succeeded(result));
  return result;
}
