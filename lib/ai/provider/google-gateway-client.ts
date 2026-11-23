import { GoogleGenAI } from "@google/genai";
import { generationAliasOutcome, assertGatewayAliasAvailable, withGatewayAlias, GatewayAliasCooldownError, isAliasCredentialFailure } from "./alias-health";
import { gatewayEndpoint, isGatewayCredentialsRequiredBody, isGatewayCredentialsRequiredError } from "./gateway";

import { MODEL_IDS, upstreamModelName } from "./model-registry";

export interface GoogleGatewayClientOptions {
  readonly modelId?: string;
  /** Force a specific Cloudflare AI Gateway BYOK alias (never sends x-goog-api-key or ?key=). */
  readonly byokAlias?: string;
  /** Prefer a Cloudflare AI Gateway BYOK alias, falling back to apiKey on confirmed missing credentials. */
  readonly preferByokAlias?: string;
  /** The lifecycle checked shared health before marking its leases dispatched. */
  readonly aliasAdmitted?: boolean;
}

const NATIVE_QUERY_KEY_PATH = /:(?:generateContent|streamGenerateContent|embedContent|batchEmbedContents)$/;
const MISSING_BYOK_TTL_MS = 5 * 60_000;
const missingGeminiByokUntil = new Map<string, number>();

export function resetGeminiByokCacheForTests(): void {
  missingGeminiByokUntil.clear();
}

function isGeminiByokMarkedMissing(cacheKey: string): boolean {
  const until = missingGeminiByokUntil.get(cacheKey);
  if (!until) return false;
  if (until <= Date.now()) {
    missingGeminiByokUntil.delete(cacheKey);
    return false;
  }
  return true;
}

function withQueryApiKey(url: string, apiKey: string): string {
  const parsed = new URL(url);
  if (NATIVE_QUERY_KEY_PATH.test(parsed.pathname) && !parsed.searchParams.has("key")) {
    parsed.searchParams.set("key", apiKey);
  }
  return parsed.toString();
}

function stripGoogleApiKeyHeader(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  headers.delete("x-goog-api-key");
  return { ...init, headers };
}

function withGoogleApiKeyHeader(init: RequestInit | undefined, apiKey: string): RequestInit {
  const headers = new Headers(init?.headers);
  headers.delete("cf-aig-byok-alias");
  headers.set("x-goog-api-key", apiKey);
  return { ...init, headers };
}

async function isCredentialsRequiredResponse(response: Response): Promise<boolean> {
  if (response.status !== 400) return false;
  try {
    const body = await response.clone().json();
    return isGatewayCredentialsRequiredBody(body);
  } catch {
    return false;
  }
}

export function googleGatewayClient(
  apiKey: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
  timeout?: number,
  metadata: Readonly<Record<string, string>> = {},
  options: GoogleGatewayClientOptions = {},
) {
  const baseUrl = gatewayEndpoint(env.CF_AI_GATEWAY_URL, "google-ai-studio");
  if (!env.CF_AI_GATEWAY_TOKEN) throw new Error("Cloudflare AI Gateway token unavailable");

  const forcedByok = options.byokAlias?.trim() || undefined;
  const preferredByok = forcedByok ?? (options.preferByokAlias?.trim() || undefined);
  const cacheKey = preferredByok ? `${baseUrl}\0${preferredByok}` : undefined;
  const hasFallbackKey = Boolean(apiKey?.trim());
  const canFallbackToKey = Boolean(!forcedByok && preferredByok && hasFallbackKey);

  const baseHeaders: Record<string, string> = {
    ...metadata,
    "cf-aig-no-wholesale": "true",
    "cf-aig-max-attempts": "1",
    "cf-aig-collect-log-payload": "false",
    "cf-aig-authorization": "Bearer " + env.CF_AI_GATEWAY_TOKEN,
  };
  if (!metadata["cf-aig-cache-key"]) baseHeaders["cf-aig-skip-cache"] = "true";

  const client = new GoogleGenAI({
    apiKey: hasFallbackKey ? apiKey : "byok",
    vertexai: false,
    // Omitting retryOptions sends once and preserves SDK HTTP status errors.
    httpOptions: { baseUrl, timeout, headers: baseHeaders },
  });

  // Patch apiClient.apiCall so native endpoints carry ?key= in API-key mode
  // (required by Cloudflare AI Gateway with cf-aig-no-wholesale: true) and
  // BYOK mode strips x-goog-api-key and falls back on confirmed missing credentials.
  const apiClient = (client as unknown as {
    apiClient?: {
      apiCall: (url: string, requestInit: RequestInit) => Promise<Response>;
      getAuthHeaders: () => Promise<Headers>;
    };
  }).apiClient;
  if (apiClient && typeof apiClient.apiCall === "function") {
    const originalAuthHeaders = apiClient.getAuthHeaders.bind(apiClient);
    apiClient.getAuthHeaders = async () => {
      const headers = await originalAuthHeaders();
      if (forcedByok || (preferredByok && (!canFallbackToKey || !isGeminiByokMarkedMissing(cacheKey!)))) {
        headers.delete("x-goog-api-key");
      }
      return headers;
    };
    // SDK 2.8 Interactions otherwise injects its own apiKey after per-call headers.
    const nextGen = (client as unknown as { getNextGenClient?: () => { authHeaders?: () => Promise<unknown> } }).getNextGenClient?.();
    if (nextGen && typeof nextGen.authHeaders === "function") {
      nextGen.authHeaders = async () => {
        const values = await apiClient.getAuthHeaders();
        return { ...Object.fromEntries(values), "x-goog-api-key": values.get("x-goog-api-key") };
      };
    }
    const originalApiCall = apiClient.apiCall.bind(apiClient);
    apiClient.apiCall = async (url: string, requestInit: RequestInit) => {
      const target = new URL(url);
      const modelPath = target.pathname.split("/").pop();
      if (modelPath === `${MODEL_IDS.flash38}:generateContent` ||
          modelPath === `${MODEL_IDS.flash38}:streamGenerateContent`) {
        target.searchParams.delete("key");
        const headers = new Headers(requestInit.headers);
        headers.delete("x-goog-api-key");
        headers.set("cf-aig-byok-alias", "default");
        return withGatewayAlias(env, baseUrl, "default",
          () => originalApiCall(target.toString(), { ...requestInit, headers }),
          generationAliasOutcome, options.aliasAdmitted && preferredByok === "default");
      }
      const useByok = Boolean(
        forcedByok || (preferredByok && (!canFallbackToKey || !isGeminiByokMarkedMissing(cacheKey!))),
      );
      if (useByok && preferredByok) {
        const byokInit = stripGoogleApiKeyHeader(requestInit);
        const byokHeaders = new Headers(byokInit.headers);
        byokHeaders.set("cf-aig-byok-alias", preferredByok);
        const invoke = () => originalApiCall(url, { ...byokInit, headers: byokHeaders });
        const aliasOutcome = async (res: Response) => {
          if (canFallbackToKey && await isCredentialsRequiredResponse(res)) return undefined;
          return generationAliasOutcome(res);
        };
        let response: Response;
        try {
          response = NATIVE_QUERY_KEY_PATH.test(new URL(url).pathname)
            ? await withGatewayAlias(env, baseUrl, preferredByok, invoke, aliasOutcome, options.aliasAdmitted)
            : await invoke();
        } catch (error) {
          if (canFallbackToKey && error instanceof GatewayAliasCooldownError) {
            return originalApiCall(withQueryApiKey(url, apiKey), withGoogleApiKeyHeader(requestInit, apiKey));
          }
          throw error;
        }
        if (canFallbackToKey && await isCredentialsRequiredResponse(response)) {
          missingGeminiByokUntil.set(cacheKey!, Date.now() + MISSING_BYOK_TTL_MS);
          return originalApiCall(withQueryApiKey(url, apiKey), withGoogleApiKeyHeader(requestInit, apiKey));
        }
        return response;
      }
      return originalApiCall(withQueryApiKey(url, apiKey), withGoogleApiKeyHeader(requestInit, apiKey));
    };
  }

  // The Interactions transport drops SDK-level headers. Supply them per call.
  const interactions = client.interactions;
  const create = interactions.create.bind(interactions);
  interactions.create = (async (params, callOptions) => {
    const useByok = Boolean(
      forcedByok || (preferredByok && (!canFallbackToKey || !isGeminiByokMarkedMissing(cacheKey!))),
    );
    if (useByok && preferredByok) {
      try {
        return await withGatewayAlias(env, baseUrl, preferredByok, () => create(params, {
          ...callOptions,
          headers: {
            ...callOptions?.headers,
            ...baseHeaders,
            "cf-aig-byok-alias": preferredByok,
          },
          maxRetries: 0,
        }), () => true, options.aliasAdmitted, (error) => !(canFallbackToKey && isGatewayCredentialsRequiredError(error)) && isAliasCredentialFailure(error));
      } catch (error) {
        if (canFallbackToKey && (isGatewayCredentialsRequiredError(error) || error instanceof GatewayAliasCooldownError)) {
          if (isGatewayCredentialsRequiredError(error)) {
            missingGeminiByokUntil.set(cacheKey!, Date.now() + MISSING_BYOK_TTL_MS);
          }
          const fallbackHeaders = { ...baseHeaders };
          delete fallbackHeaders["cf-aig-byok-alias"];
          return create(params, {
            ...callOptions,
            headers: { ...callOptions?.headers, ...fallbackHeaders, "x-goog-api-key": apiKey },
            maxRetries: 0,
          });
        }
        throw error;
      }
    }
    const keyHeaders = { ...baseHeaders };
    delete keyHeaders["cf-aig-byok-alias"];
    return create(params, {
      ...callOptions,
      headers: { ...callOptions?.headers, ...keyHeaders },
      maxRetries: 0,
    });
  }) as typeof interactions.create;

  return client;
}

export async function prepareGoogleGatewayClient(
  ...args: Parameters<typeof googleGatewayClient>
) {
  const [key, env = process.env, timeout, metadata, options = {}] = args;
  const byokAlias = options.modelId && upstreamModelName(options.modelId) === MODEL_IDS.flash38
    ? "default" : options.byokAlias;
  const alias = byokAlias?.trim() || options.preferByokAlias?.trim();
  const baseUrl = gatewayEndpoint(env.CF_AI_GATEWAY_URL, "google-ai-studio");
  if (alias && (byokAlias || !key?.trim() || !isGeminiByokMarkedMissing(`${baseUrl}\0${alias}`))) {
    await assertGatewayAliasAvailable(env, baseUrl, alias);
  }
  return googleGatewayClient(key, env, timeout, metadata, { ...options, byokAlias, aliasAdmitted: true });
}
