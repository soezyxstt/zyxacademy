import { modelDisplayName } from "./recent-models";
import { gatewayEndpoint } from "./gateway";
import { buildAiGatewayHeaders, type GatewayMetadataInput } from "../gateway-metadata";
import { logAiRequest } from "../analytics";
import { createHash, randomInt } from "node:crypto";
import { classifyProviderError, ProviderAdapterError } from "./errors";
import { MODEL_IDS, supportsTextProvider, TEXT_PROFILES, isTextProfile, textProfileIds } from "./model-registry";
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

export function compatibleSettings(env: Environment = process.env, id: string = MODEL_IDS.compatibleText) {
  if (!isTextProfile(id)) return null;
  const profile = TEXT_PROFILES[id];
  const model = env[profile.prefix + "_MODEL" + profile.modelSuffix]?.trim() ?? standardModels[id];
  const aliases = (env[profile.prefix + "_BYOK_ALIASES"] ?? "").split(",").map(alias => alias.trim()).filter(Boolean);
  const origin = env.BETTER_AUTH_URL?.replace(/\/$/, "") ?? "";
  const staging = origin === "https://staging.zyxacademy.com" ||
    (env.ZYX_ENVIRONMENT === "staging" && /^https:\/\/zyx-academy-staging-edge\.[a-z0-9-]+\.workers\.dev$/.test(origin));
  if (!model || !aliases.length || !env.CF_AI_GATEWAY_TOKEN ||
      !staging ||
      !env.ZYRA_CONTROL_PLANE_URL || !env.ZYRA_CONTROL_PLANE_TOKEN) return null;
  try {
    const route = profile.route || env[profile.prefix + "_GATEWAY_ROUTE"];
    if (!route || (!profile.route && !route.startsWith("custom-"))) return null;
    const url = gatewayEndpoint(env.CF_AI_GATEWAY_URL, route) + "/chat/completions";
    return { url, model, credentials: aliases, token: env.CF_AI_GATEWAY_TOKEN };
  } catch {
    return null;
  }
}

// Authentication failures are scoped to the credential and the current server process.
const unavailableUntil = new Map<string, number>();
function credentialId(url: string, credential: string) {
  return createHash("sha256").update(url).update("\0").update(credential).digest("hex");
}

export function compatibleDiagnostics(env: Environment = process.env) {
  return textProfileIds.flatMap(id => {
    const settings = compatibleSettings(env, id);
    if (!settings) return [];
    return [{
      model: TEXT_PROFILES[id].label + " / " + modelDisplayName(settings.model),
      keys: settings.credentials.map((key) => ({
        label: key,
        cooldownUntil: unavailableUntil.get(credentialId(settings.url, key)) ?? 0,
      })),
    }];
  });
}

export function prepareCompatibleText(input: ProviderGenerateRequest & Omit<GatewayMetadataInput, "deadlineMs"> & { projectAlias: string }, env: Environment = process.env) {
  const settings = compatibleSettings(env, input.modelId);
  if (!settings || !isTextProfile(input.modelId) || !supportsTextProvider(input.feature) || input.projectAlias !== TEXT_PROFILES[input.modelId].group
    || !input.parts.length || input.parts.some(part => part.type !== "text")) throw new Error("Compatible text route unavailable");
  const config = input.config ?? {};
  if (Object.keys(config).some(key => !["systemInstruction", "responseMimeType", "responseSchema"].includes(key))
    || (config.systemInstruction !== undefined && typeof config.systemInstruction !== "string")
    || (config.responseMimeType !== undefined && config.responseMimeType !== "application/json")) throw new Error("Unsupported text configuration");
  const messages = [];
  if (config.systemInstruction) messages.push({ role: "system", content: config.systemInstruction });
  // The caller validates structured output and retains its bounded repair policy.
  if (config.responseSchema) messages.push({ role: "system", content: "Return JSON matching this schema: " + JSON.stringify(config.responseSchema) });
  messages.push({ role: "user", content: input.parts.map(part => part.type === "text" ? part.text : "").join("\n") });
  const body = JSON.stringify({ model: settings.model, messages, ...(config.responseMimeType ? {response_format: {type: "json_object"}} : {}) });
  const now = Date.now();
  for (const [id, until] of unavailableUntil) if (until <= now) unavailableUntil.delete(id);
  const available = settings.credentials.filter(key => !unavailableUntil.has(credentialId(settings.url, key)));
  if (!available.length) throw new ProviderAdapterError({ code: "PROVIDER_AUTHENTICATION", message: "No available text provider credential", retryClassification: "authentication" });
  const credential = available[randomInt(available.length)];
  const headers: Record<string, string> = {"Content-Type": "application/json"};
  Object.assign(headers, buildAiGatewayHeaders({ ...input, deadlineMs: 15000 }));
  headers["cf-aig-authorization"] = "Bearer " + settings.token;
  headers["cf-aig-no-wholesale"] = "true";
  headers["cf-aig-byok-alias"] = credential;
  return async (): Promise<ProviderGenerationResult> => {
    const started = Date.now();
    try {
      const response = await fetch(settings.url, {method: "POST", redirect: "error", headers, body, signal: AbortSignal.timeout(15000)});
      if (response.status === 401 || response.status === 403) unavailableUntil.set(credentialId(settings.url, credential), Date.now() + 60_000);
      if (!response.ok) throw classifyProviderError({status: response.status}, input.modelId);
      const data = await response.json();
      const choice = data?.choices?.[0];
      if (typeof choice?.message?.content !== "string" || !choice.message.content.trim()) throw new ProviderAdapterError({code:"MALFORMED_RESPONSE", message:"Missing provider text", retryClassification:"malformed_response"});
      logAiRequest({ operation: "chatCompletions", model: settings.model, viaGateway: true, latencyMs: Date.now() - started, success: true });
      return {modelId: input.modelId, upstreamModel: settings.model, text: choice.message.content, finishReason: String(choice.finish_reason ?? "unknown"), latencyMs: Date.now() - started, viaGateway: true, retryClassification: "none",
        usage: {promptTokens: data.usage?.prompt_tokens, outputTokens: data.usage?.completion_tokens, totalTokens: data.usage?.total_tokens}};
    } catch (error) {
      logAiRequest({ operation: "chatCompletions", model: settings.model, viaGateway: true, latencyMs: Date.now() - started, success: false });
      throw error;
    }
  };
}
