import { zyraLiveProgress } from "@/lib/zyra/live-progress";
import { readChatCompletion } from "./chat-stream";
import { textProviderFeatureAllowed } from "../model-settings";
import { modelDisplayName } from "./recent-models";
import { generationAliasOutcome, withGatewayAlias, assertGatewayAliasAvailable, aliasCooldownUntil, GatewayAliasCooldownError } from "./alias-health";
import {
  conventionByokAliases,
  enabledGatewayProviders,
  gatewayEndpoint,
  isGatewayCredentialsRequiredBody,
  type GatewayProviderName,
} from "./gateway";
import { buildAiGatewayHeaders, type GatewayMetadataInput } from "../gateway-metadata";
import { logAiRequest } from "../analytics";
import { randomInt } from "node:crypto";
import { classifyProviderError, ProviderAdapterError } from "./errors";
import { discoveredModelId, getModelEntry, MODEL_IDS, getTextProfile, isTextProfile, textProfileIds } from "./model-registry";
import { normalizeInputParts } from "./provider-adapter";
import type { ProviderGenerateRequest, ProviderGenerationResult } from "./provider-adapter";

type Environment = Readonly<Record<string, string | undefined>>;

export const standardModels: Readonly<Record<string, string>> = {
  [MODEL_IDS.openai]: "gpt-6.2-sol",
  [MODEL_IDS.openai2]: "gpt-6.2-astra",
  [MODEL_IDS.openai3]: "gpt-6.1-terra",
  [MODEL_IDS.openai4]: "gpt-6-luna",
  [MODEL_IDS.meta]: "muse-spark-1.3",
  [MODEL_IDS.meta2]: "muse-wonder-1.0",
  [MODEL_IDS.meta3]: "muse-spark-1.2",
  [MODEL_IDS.meta4]: "muse-spark-1.3-contributor",
  [MODEL_IDS.meta5]: "muse-spark-1.2-contributor",
  [MODEL_IDS.deepseek]: "deepseek-flash",
};

const GROUP_TO_GATEWAY_PROVIDER: Readonly<Record<string, GatewayProviderName>> = {
  openai: "openai",
  deepseek: "deepseek",
  meta: "muse",
};

const DEFAULT_CUSTOM_ROUTES: Readonly<Record<string, string>> = {
  meta: "custom-muse",
};

const discoveredByokAliases = new Map<string, readonly string[]>();

export function setDiscoveredByokAliases(group: string, aliases: readonly string[]): void {
  discoveredByokAliases.set(group, [...aliases]);
}

export function getDiscoveredByokAliases(group: string): readonly string[] | undefined {
  return discoveredByokAliases.get(group);
}

export function clearDiscoveredByokAliasesForTests(): void {
  discoveredByokAliases.clear();
}

export function conventionProviderForGroup(group: string): GatewayProviderName | undefined {
  return GROUP_TO_GATEWAY_PROVIDER[group];
}

export function textGatewaySettings(env: Environment = process.env, id: string = MODEL_IDS.compatibleText) {
  if (!isTextProfile(id)) return null;
  const profile = getTextProfile(id)!;
  const model = profile.model ?? env[profile.prefix + "_MODEL" + profile.modelSuffix]?.trim() ?? standardModels[id];
  const explicitAliases = (env[profile.prefix + "_BYOK_ALIASES"] ?? "")
    .split(",")
    .map(alias => alias.trim())
    .filter(Boolean);
  const gatewayProvider = GROUP_TO_GATEWAY_PROVIDER[profile.group];
  const enabledProviders = enabledGatewayProviders(env);

  let aliases: readonly string[];
  let conventionManaged = false;
  if (explicitAliases.length > 0) {
    aliases = explicitAliases;
  } else if (gatewayProvider && enabledProviders.has(gatewayProvider)) {
    conventionManaged = true;
    const discovered = discoveredByokAliases.get(profile.group);
    if (discovered !== undefined) {
      aliases = discovered;
    } else {
      // On cold start before selector discovery runs, dispatch slot 1 so we
      // never pick an unconfigured higher slot at random.
      aliases = [conventionByokAliases(gatewayProvider, 1)[0]];
    }
  } else {
    aliases = [];
  }

  const origin = env.BETTER_AUTH_URL?.replace(/\/$/, "") ?? "";
  const staging = origin === "https://staging.zyxacademy.com" ||
    (env.ZYX_ENVIRONMENT === "staging" && /^https:\/\/zyx-academy-staging-edge\.[a-z0-9-]+\.workers\.dev$/.test(origin));
  if (!model || !aliases.length || !env.CF_AI_GATEWAY_TOKEN ||
      !staging) return null;
  try {
    const route = profile.route || env[profile.prefix + "_GATEWAY_ROUTE"]?.trim() || DEFAULT_CUSTOM_ROUTES[profile.group];
    if (!route || (!profile.route && !route.startsWith("custom-"))) return null;
    const url = gatewayEndpoint(env.CF_AI_GATEWAY_URL, route) + "/chat/completions";
    return { url, model, credentials: [...aliases], token: env.CF_AI_GATEWAY_TOKEN, conventionManaged };
  } catch {
    return null;
  }
}

export function compatibleSettings(env: Environment = process.env, id: string = MODEL_IDS.compatibleText) {
  if (!env.ZYRA_CONTROL_PLANE_URL || !env.ZYRA_CONTROL_PLANE_TOKEN) return null;
  return textGatewaySettings(env, id);
}

export function compatibleDiagnostics(env: Environment = process.env) {
  return textProfileIds.flatMap(id => {
    const settings = compatibleSettings(env, id);
    if (!settings) return [];
    return [{
      model: getTextProfile(id)!.label + " / " + modelDisplayName(settings.model),
      keys: settings.credentials.map((key) => ({
        label: key,
        cooldownUntil: aliasCooldownUntil(env, settings.url, key),
      })),
    }];
  });
}

export async function prepareCompatibleText(input: ProviderGenerateRequest & Omit<GatewayMetadataInput, "deadlineMs"> & { projectAlias: string }, env: Environment = process.env) {
  const settings = compatibleSettings(env, input.modelId);
  if (!settings || !isTextProfile(input.modelId) || !textProviderFeatureAllowed(input.feature) || input.projectAlias !== getTextProfile(input.modelId)!.group
    || !input.parts.length) throw new Error("Compatible text route unavailable");
  const config = input.config ?? {};
  if (Object.keys(config).some(key => !["systemInstruction", "responseMimeType", "responseSchema", "maxOutputTokens", "temperature"].includes(key))
    || (config.maxOutputTokens !== undefined && (!Number.isInteger(config.maxOutputTokens) || Number(config.maxOutputTokens) < 1 || Number(config.maxOutputTokens) > 4096))
    || (config.temperature !== undefined && (typeof config.temperature !== "number" || !Number.isFinite(config.temperature) || config.temperature < 0 || config.temperature > 2))
    || (config.systemInstruction !== undefined && typeof config.systemInstruction !== "string")
    || (config.responseMimeType !== undefined && config.responseMimeType !== "application/json")) throw new Error("Unsupported text configuration");
  const messages = [];
  if (config.systemInstruction) messages.push({ role: "system", content: config.systemInstruction });
  // The caller validates structured output and retains its bounded repair policy.
  const arrayOutput = typeof config.responseSchema === "object" && config.responseSchema !== null && "type" in config.responseSchema && String(config.responseSchema.type).toLowerCase() === "array";
  if (arrayOutput) messages.push({ role: "system", content: "Return one JSON object with an items property containing the array matching this schema: " + JSON.stringify(config.responseSchema) });
  else if (config.responseSchema) messages.push({ role: "system", content: "Return JSON matching this schema: " + JSON.stringify(config.responseSchema) });
  const hasImages = input.parts.some(part => part.type === "image");
  let content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
  if (hasImages) {
    const provider = conventionProviderForGroup(getTextProfile(input.modelId)!.group);
    if (!provider) throw new Error("Unsupported image provider");
    const entry = getModelEntry(discoveredModelId(provider, settings.model));
    content = normalizeInputParts(input.parts, entry).map(part => part.type === "text"
      ? { type: "text", text: part.text }
      : { type: "image_url", image_url: { url: `data:${part.mimeType};base64,${part.data}` } });
  } else {
    content = input.parts.map(part => part.type === "text" ? part.text : "").join("\n");
  }
  messages.push({ role: "user", content });
  const outputLimit = config.maxOutputTokens === undefined ? {} : { [getTextProfile(input.modelId)!.group === "openai" ? "max_completion_tokens" : "max_tokens"]: config.maxOutputTokens };
  const fixedSampling = getTextProfile(input.modelId)!.group === "openai" && /^(?:gpt-[56]|o[1-9])/.test(settings.model);
  const progress = zyraLiveProgress.getStore();
  const deadlineMs = progress || input.userCohort !== "system" ? 30_000 : 15_000;
  const body = JSON.stringify({ model: settings.model, messages, ...(progress ? { stream: true, stream_options: { include_usage: true } } : {}), ...outputLimit, temperature: fixedSampling ? undefined : config.temperature, ...(config.responseMimeType ? {response_format: {type: "json_object"}} : {}) });
  let effectiveSettings = settings;
  const group = getTextProfile(input.modelId)!.group;
  if (settings.conventionManaged && discoveredByokAliases.get(group) === undefined) {
    const provider = conventionProviderForGroup(group);
    if (provider && provider !== "gemini") {
      const cachedAliases = await import("./selector-catalog")
        .then(mod => mod.loadCachedDiscoveredByokAliases(provider, env))
        .catch(() => null);
      if (cachedAliases && cachedAliases.length > 0) {
        effectiveSettings = { ...settings, credentials: [...cachedAliases] };
      }
    }
  }
  const credential = await selectGatewayCredential(effectiveSettings, env);
  const headers: Record<string, string> = {"Content-Type": "application/json"};
  Object.assign(headers, buildAiGatewayHeaders({ ...input, deadlineMs }));
  headers["cf-aig-authorization"] = "Bearer " + effectiveSettings.token;
  headers["cf-aig-no-wholesale"] = "true";
  return async (): Promise<ProviderGenerationResult> => {
    const started = Date.now();
    try {
      progress?.("dispatch");
      let response: Response;
      try {
        response = await withGatewayAlias(env, effectiveSettings.url, credential,
          () => fetch(effectiveSettings.url, { method: "POST", redirect: "error", headers: { ...headers, "cf-aig-byok-alias": credential }, body, signal: AbortSignal.timeout(deadlineMs) }), generationAliasOutcome, true);
      } catch (fetchError) {
        if (fetchError instanceof Error && (fetchError.name === "TimeoutError" || fetchError.name === "AbortError")) {
          throw new ProviderAdapterError({
            code: "REQUEST_TIMEOUT",
            message: "AI provider request timed out",
            retryClassification: "timeout",
            modelId: input.modelId,
            cause: fetchError,
          });
        }
        throw fetchError;
      }
      if (response.status === 400) {
        const errorBody = await response.clone().json().catch(() => null);
        if (isGatewayCredentialsRequiredBody(errorBody)) {
          throw new ProviderAdapterError({
            code: "PROVIDER_AUTHENTICATION",
            message: "AI Gateway BYOK alias is not configured",
            retryClassification: "authentication",
            modelId: input.modelId,
            httpStatus: 400,
          });
        }
      }
      if (!response.ok) throw classifyProviderError({status: response.status}, input.modelId);
      let data: Awaited<ReturnType<typeof readChatCompletion>>;
      try {
        data = await readChatCompletion(response, () => progress?.("receiving"));
      } catch (streamError) {
        throw new ProviderAdapterError({
          code: "MALFORMED_RESPONSE",
          message: streamError instanceof Error ? streamError.message : "Invalid provider response",
          retryClassification: "malformed_response",
          modelId: input.modelId,
          cause: streamError,
        });
      }
      progress?.("checking");
      const choice = data?.choices?.[0];
      if (typeof choice?.message?.content !== "string" || !choice.message.content.trim()) throw new ProviderAdapterError({code:"MALFORMED_RESPONSE", message:"Missing provider text", retryClassification:"malformed_response", modelId: input.modelId});
      let text = choice.message.content;
      if (arrayOutput) {
        let envelope: unknown;
        try {
          envelope = JSON.parse(text);
        } catch (parseError) {
          throw new ProviderAdapterError({code:"MALFORMED_RESPONSE", message:"Invalid JSON array envelope", retryClassification:"malformed_response", modelId: input.modelId, cause: parseError});
        }
        const items = Array.isArray(envelope) ? envelope : (envelope as Record<string, unknown> | null)?.items;
        if (!Array.isArray(items)) throw new ProviderAdapterError({code:"MALFORMED_RESPONSE", message:"Missing result array", retryClassification:"malformed_response", modelId: input.modelId});
        text = JSON.stringify(items);
      }
      const latencyMs = Date.now() - started;
      await logAiRequest({ operation: "chatCompletions", model: effectiveSettings.model, viaGateway: true, latencyMs, success: true }, input.userCohort !== "system");
      return {modelId: input.modelId, upstreamModel: effectiveSettings.model, text, finishReason: String(choice.finish_reason ?? "unknown"), latencyMs, viaGateway: true, retryClassification: "none",
        usage: {promptTokens: data.usage?.prompt_tokens, outputTokens: data.usage?.completion_tokens, totalTokens: data.usage?.total_tokens}};
    } catch (error) {
      await logAiRequest({ operation: "chatCompletions", model: effectiveSettings.model, viaGateway: true, latencyMs: Date.now() - started, success: false });
      throw error;
    }
  };
}

export async function selectGatewayCredential(settings: NonNullable<ReturnType<typeof compatibleSettings>>, env: Environment) {
  const available = (await Promise.all(settings.credentials.map(async alias => {
    try { await assertGatewayAliasAvailable(env, settings.url, alias); return [alias]; }
    catch (error) { if (error instanceof GatewayAliasCooldownError) return []; throw error; }
  }))).flat();
  if (!available.length) throw new GatewayAliasCooldownError();
  return available[randomInt(available.length)];
}
