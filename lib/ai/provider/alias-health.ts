import { createHash, randomUUID } from "node:crypto";
import { ControlPlaneClient } from "../control-plane-client";
import { isGatewayCredentialsRequiredBody, isGatewayCredentialsRequiredError } from "./gateway";
import { ProviderAdapterError } from "./errors";

const ALIAS_COOLDOWN_MS = 5 * 60_000;
const FAILURE_WINDOW_MS = 10 * 60_000;
const HEALTHY_CACHE_TTL_MS = 10_000;
const LEGACY_COOLDOWN_MS = 24 * 60 * 60_000;
type LocalAliasState = { failures: number; cooldownUntil: number; lastFailureAt?: number; checkedAt?: number };
const local = new Map<string, LocalAliasState>();
export function resetAliasHealthForTests() { local.clear(); }
function identity(env: Readonly<Record<string, string | undefined>>, route: string, alias: string) {
  return createHash("sha256").update(JSON.stringify([env.CF_AI_GATEWAY_URL, route, alias])).digest("hex");
}
function normalizeAliasHealth(state: LocalAliasState, now: number): LocalAliasState {
  if (!state.cooldownUntil) {
    if (state.lastFailureAt != null && now - state.lastFailureAt > FAILURE_WINDOW_MS) {
      return { failures: 0, cooldownUntil: 0 };
    }
    return { failures: state.failures, cooldownUntil: 0, ...(state.lastFailureAt != null ? { lastFailureAt: state.lastFailureAt } : {}) };
  }
  const effectiveCooldownUntil = state.cooldownUntil - now > ALIAS_COOLDOWN_MS
    ? state.cooldownUntil - LEGACY_COOLDOWN_MS + ALIAS_COOLDOWN_MS
    : state.cooldownUntil;
  return effectiveCooldownUntil > now
    ? { failures: state.failures, cooldownUntil: effectiveCooldownUntil }
    : { failures: 0, cooldownUntil: 0 };
}
export function aliasCooldownUntil(env: Readonly<Record<string, string | undefined>>, route: string, alias: string) {
  const entry = local.get(identity(env, route, alias));
  return entry ? normalizeAliasHealth(entry, Date.now()).cooldownUntil : 0;
}
export class GatewayAliasCooldownError extends ProviderAdapterError {
  constructor() { super({ code: "PROVIDER_AUTHENTICATION", message: "AI Gateway alias is cooling down", retryClassification: "authentication" }); }
}

export function isAliasCredentialFailure(error: unknown): boolean {
  if (isGatewayCredentialsRequiredError(error)) return true;
  if (error instanceof ProviderAdapterError) {
    return error.code === "PROVIDER_AUTHENTICATION" || error.retryClassification === "authentication";
  }
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const status = record.status ?? record.statusCode;
    if (status === 401 || status === 402 || status === 403) return true;
  }
  return false;
}

export async function assertGatewayAliasAvailable(env: Readonly<Record<string, string | undefined>>, route: string, alias: string) {
  const id = identity(env, route, alias);
  const now = Date.now();
  const cached = local.get(id);
  if (cached && cached.failures === 0 && cached.cooldownUntil === 0 && cached.checkedAt != null && now - cached.checkedAt < HEALTHY_CACHE_TTL_MS) {
    return;
  }
  const control = env.ZYRA_CONTROL_PLANE_URL && env.ZYRA_CONTROL_PLANE_TOKEN
    ? new ControlPlaneClient({ baseUrl: env.ZYRA_CONTROL_PLANE_URL, token: env.ZYRA_CONTROL_PLANE_TOKEN }) : undefined;
  let state: LocalAliasState = cached ?? { failures: 0, cooldownUntil: 0 };
  // shortcut: without a reachable control plane, protection is process-local; configure it for shared cooldowns.
  if (control) { try { state = await control.aliasHealth(id); } catch { /* Keep local protection if health storage is unreachable. */ } }
  state = { ...normalizeAliasHealth(state, now), checkedAt: now };
  local.set(id, state);
  if (state.cooldownUntil > now) throw new GatewayAliasCooldownError();
}

// Only confirmed credential or billing failures should cool down a gateway BYOK alias.
// Rate limits (429), transient upstream 5xx, and model/payload errors are scoped per model.
export async function generationAliasOutcome(response: Response): Promise<boolean | undefined> {
  if (response.ok) return true;
  if (response.status === 401 || response.status === 402 || response.status === 403) return false;
  if (response.status === 400) {
    const body = await response.clone().json().catch(() => null);
    return isGatewayCredentialsRequiredBody(body) ? false : undefined;
  }
  return undefined;
}

export async function withGatewayAlias<T>(
  env: Readonly<Record<string, string | undefined>>, route: string, alias: string,
  invoke: () => Promise<T>, succeeded: (result: T) => boolean | undefined | Promise<boolean | undefined>, admitted = false,
  shouldRecordError: (error: unknown) => boolean = isAliasCredentialFailure,
): Promise<T> {
  // Admitted lifecycle calls checked shared health before dispatch; in-flight calls still record their outcome.
  if (!admitted) await assertGatewayAliasAvailable(env, route, alias);
  const id = identity(env, route, alias);
  const state = local.get(id) ?? { failures: 0, cooldownUntil: 0 };
  const control = env.ZYRA_CONTROL_PLANE_URL && env.ZYRA_CONTROL_PLANE_TOKEN
    ? new ControlPlaneClient({ baseUrl: env.ZYRA_CONTROL_PLANE_URL, token: env.ZYRA_CONTROL_PLANE_TOKEN }) : undefined;
  const attemptId = randomUUID();
  const record = async (success: boolean) => {
    const now = Date.now();
    if (control) {
      try {
        const updated = normalizeAliasHealth(await control.recordAliasAttempt(id, attemptId, success), now);
        local.set(id, { ...updated, checkedAt: now });
        return;
      } catch { /* Never hide a provider result because its health receipt failed. */ }
    }
    // Read the latest local outcome so parallel completions cannot overwrite a failure count.
    const previous = normalizeAliasHealth(local.get(id) ?? state, now);
    if (previous.cooldownUntil > now) return;
    const failures = success ? 0 : previous.failures + 1;
    const next: LocalAliasState = {
      failures,
      cooldownUntil: failures >= 3 ? now + ALIAS_COOLDOWN_MS : 0,
      ...(success ? {} : { lastFailureAt: now }),
      checkedAt: now,
    };
    local.set(id, next);
  };
  let result: T;
  try { result = await invoke(); } catch (error) { if (shouldRecordError(error)) await record(false); throw error; }
  const outcome = await succeeded(result);
  if (outcome !== undefined) await record(outcome);
  return result;
}
