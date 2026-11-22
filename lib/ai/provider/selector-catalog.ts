import { ControlPlaneClient } from "../control-plane-client";
import { classifyProviderError } from "./errors";
import { randomUUID } from "node:crypto";
import {
  compatibleSettings,
  conventionProviderForGroup,
  prepareCompatibleText,
  setDiscoveredByokAliases,
  standardModels,
} from "./compatible-text";
import {
  conventionByokAliases,
  enabledGatewayProviders,
  isGatewayCredentialsRequiredError,
} from "./gateway";
import { getProjectAliases, MODEL_IDS, MODEL_REGISTRY, TEXT_PROFILES, textProfileIds, type ModelId } from "./model-registry";
import { officialRelease, eligibleSelectorModel } from "./recent-models";

type Choice = { id: ModelId; model: string };
type TextId = typeof textProfileIds[number];

function canTryNextCredential(error: unknown) {
  const failure = classifyProviderError(error);
  return failure.retryClassification === "authentication" || failure.httpStatus === 429;
}

async function probe(modelId: ModelId, projectAlias: string, dispatch: () => Promise<boolean>) {
  const ledger = new ControlPlaneClient();
  const requestId = randomUUID();
  const reservation = await ledger.reserve({
    userId: "selector-smoke", role: "admin", feature: "selector-smoke", routeClass: "default",
    cacheStatus: "bypass", modelId, probeProjectAlias: projectAlias, idempotencyKey: requestId,
  });
  if (reservation.status !== "reserved") return false;
  const { leaseId } = reservation.lease;
  if (reservation.lease.projectAlias !== projectAlias) {
    await ledger.refund(leaseId, "PROJECT_UNAVAILABLE");
    return false;
  }
  const dispatched = await ledger.dispatch(leaseId);
  if (dispatched.status !== "updated" || dispatched.lease.state !== "dispatched") return false;
  const started = Date.now();
  let success = false;
  try {
    success = await dispatch();
    return success;
  } finally {
    const settled = await ledger.commit({
      leaseId, providerAttemptId: requestId, outcomeCode: success ? "SMOKE_SUCCESS" : "SMOKE_FAILURE",
      outcomeClass: success ? "success" : "unknown", latencyMs: Date.now() - started,
    });
    if (settled.status === "rejected") throw new Error("Selector probe settlement failed");
  }
}

async function googleChoices(): Promise<Choice[]> {
  if (!enabledGatewayProviders(process.env).has("gemini")) return [];
  const aliases = getProjectAliases({ GEMINI_PROJECT_ALIAS_1: process.env.GEMINI_PROJECT_ALIAS_1, GEMINI_PROJECT_ALIAS_2: process.env.GEMINI_PROJECT_ALIAS_2, GEMINI_PROJECT_ALIAS_3: process.env.GEMINI_PROJECT_ALIAS_3, GEMINI_PROJECT_ALIAS_4: process.env.GEMINI_PROJECT_ALIAS_4 });
  const keys = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2, process.env.GEMINI_API_KEY_3, process.env.GEMINI_API_KEY_4];
  const byokAliases = conventionByokAliases("gemini");
  const { googleGatewayClient } = await import("./google-gateway-client");
  const clients = byokAliases.map((byokAlias, i) => ({
    client: googleGatewayClient(keys[i] ?? "", process.env, 8000, {}, { preferByokAlias: byokAlias }),
    alias: aliases[i],
  }));
  let healthy = false;
  for (const { client, alias } of clients) {
    try {
      healthy = await probe(MODEL_IDS.default, alias, async () => {
        const result = await client.models.generateContent({
          model: MODEL_IDS.default, contents: "Reply OK.", config: { maxOutputTokens: 32 },
        });
        return Boolean(result.text?.trim());
      });
      if (healthy) break;
    } catch (error) {
      if (isGatewayCredentialsRequiredError(error)) break;
      if (!canTryNextCredential(error)) throw error;
    }
  }
  if (!healthy) return [];
  const candidates = Object.values(MODEL_REGISTRY).flatMap(entry => {
    const release = officialRelease(entry.id, "google");
    return entry.ordinaryRoutingAllowed && release && eligibleSelectorModel(entry.id)
      ? [{ id: entry.id, model: entry.id }] : [];
  });
  const available = await Promise.all(candidates.map(async choice => {
    for (const { client } of clients) {
      try {
        const model = await client.models.get({ model: choice.id });
        if (model.name?.replace(/^models\//, "") === choice.id) return [choice];
      } catch { /* Model access can differ by project. */ }
    }
    return [];
  }));
  return available.flat();
}

async function textChoices(ids: TextId[]): Promise<Choice[]> {
  const base = ids[0];
  const profile = TEXT_PROFILES[base];
  const prefix = profile.prefix;
  const gatewayProvider = conventionProviderForGroup(profile.group);
  const explicitAliases = (process.env[prefix + "_BYOK_ALIASES"] ?? "")
    .split(",")
    .map(alias => alias.trim())
    .filter(Boolean);
  const isConvention = explicitAliases.length === 0 && Boolean(gatewayProvider);
  const probeEnvBase = { ...process.env, [prefix + "_MODEL"]: standardModels[base] ?? process.env[prefix + "_MODEL"] };
  const candidateAliases = isConvention && gatewayProvider
    ? (enabledGatewayProviders(process.env).has(gatewayProvider) ? conventionByokAliases(gatewayProvider) : [])
    : explicitAliases;
  if (!candidateAliases.length) return [];

  // Verify route and staging gate before probing any alias.
  const initialCheck = compatibleSettings({ ...probeEnvBase, [prefix + "_BYOK_ALIASES"]: candidateAliases[0] }, base);
  if (!initialCheck) return [];

  const choices: Choice[] = [];
  for (const id of ids) {
    const settings = compatibleSettings({ ...process.env, [prefix + "_BYOK_ALIASES"]: candidateAliases[0] }, id);
    if (!settings || choices.some(choice => choice.model === settings.model)) continue;
    const release = officialRelease(settings.model, profile.group);
    if (release && eligibleSelectorModel(settings.model)) choices.push({ id, model: settings.model });
  }
  if (!choices.length) return [];

  if (isConvention) {
    const discovered: string[] = [];
    for (const alias of candidateAliases) {
      try {
        const dispatch = prepareCompatibleText({
          feature: "playground", projectAlias: profile.group,
          requestId: randomUUID(), userCohort: "admin", routeClass: "selector-smoke", modelId: base,
          parts: [{ type: "text", text: "Reply OK." }],
        }, { ...probeEnvBase, [prefix + "_BYOK_ALIASES"]: alias });
        const ok = await probe(base, profile.group, async () => Boolean((await dispatch()).text));
        if (ok) discovered.push(alias);
      } catch (error) {
        if (isGatewayCredentialsRequiredError(error)) break;
        if (!canTryNextCredential(error)) throw error;
      }
    }
    setDiscoveredByokAliases(profile.group, discovered);
    return discovered.length > 0 ? choices : [];
  }

  for (const alias of new Set(candidateAliases)) {
    try {
      const dispatch = prepareCompatibleText({
        feature: "playground", projectAlias: profile.group,
        requestId: randomUUID(), userCohort: "admin", routeClass: "selector-smoke", modelId: base,
        parts: [{ type: "text", text: "Reply OK." }],
      }, { ...probeEnvBase, [prefix + "_BYOK_ALIASES"]: alias });
      const ok = await probe(base, profile.group, async () => Boolean((await dispatch()).text));
      return ok ? choices : [];
    } catch (error) {
      if (!canTryNextCredential(error)) throw error;
    }
  }
  return [];
}

const checks = new Map<string, { expires: number; result: Promise<Choice[]> }>();

function cachedCheck(group: string, run: () => Promise<Choice[]>) {
  const previous = checks.get(group);
  if (previous && previous.expires > Date.now()) return previous.result;
  const check = { expires: Infinity, result: run().catch((): Choice[] => []) };
  checks.set(group, check);
  void check.result.then(choices => {
    check.expires = Date.now() + (choices.length ? 24 * 60 : 5) * 60_000;
  });
  return check.result;
}

export async function selectorCatalog() {
  const groups = new Map<string, TextId[]>();
  for (const id of textProfileIds) {
    const group = TEXT_PROFILES[id].group;
    groups.set(group, [...(groups.get(group) ?? []), id]);
  }
  const results = await Promise.all([
    cachedCheck("google", googleChoices),
    ...Array.from(groups, ([group, ids]) => cachedCheck(group, () => textChoices(ids))),
  ]);
  return new Set(results.flat().filter(choice => eligibleSelectorModel(choice.model)).map(choice => choice.id));
}
