import { GoogleGenAI } from "@google/genai";
import { gatewayEndpoint, isGatewayCredentialsRequiredBody, isGatewayCredentialsRequiredError } from "./gateway";

export interface GoogleGatewayClientOptions {
  /** Force a specific Cloudflare AI Gateway BYOK alias (never sends x-goog-api-key or ?key=). */
  readonly byokAlias?: string;
  /** Prefer a Cloudflare AI Gateway BYOK alias, falling back to apiKey if Cloudflare returns 400 (2044). */
  readonly preferByokAlias?: string;
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
  const startWithByok = Boolean(
    forcedByok || (preferredByok && (!hasFallbackKey || !isGeminiByokMarkedMissing(cacheKey!))),
  );
  const canFallbackToKey = Boolean(!forcedByok && preferredByok && hasFallbackKey);

  const baseHeaders: Record<string, string> = {
    ...metadata,
    "cf-aig-no-wholesale": "true",
    "cf-aig-max-attempts": "1",
    "cf-aig-collect-log-payload": "false",
    "cf-aig-authorization": "Bearer " + env.CF_AI_GATEWAY_TOKEN,
  };
  if (!metadata["cf-aig-cache-key"]) baseHeaders["cf-aig-skip-cache"] = "true";
  if (startWithByok && preferredByok) {
    baseHeaders["cf-aig-byok-alias"] = preferredByok;
  }

  const client = new GoogleGenAI({
    apiKey: hasFallbackKey ? apiKey : "byok",
    vertexai: false,
    // Omitting retryOptions sends once and preserves SDK HTTP status errors.
    httpOptions: { baseUrl, timeout, headers: baseHeaders },
  });

  // Patch apiClient.apiCall so native endpoints carry ?key= in API-key mode
  // (required by Cloudflare AI Gateway with cf-aig-no-wholesale: true) and
  // BYOK mode strips x-goog-api-key (with transparent fallback on 400/2044).
  const apiClient = (client as unknown as {
    apiClient?: { apiCall: (url: string, requestInit: RequestInit) => Promise<Response> };
  }).apiClient;
  if (apiClient && typeof apiClient.apiCall === "function") {
    const originalApiCall = apiClient.apiCall.bind(apiClient);
    apiClient.apiCall = async (url: string, requestInit: RequestInit) => {
      const useByok = Boolean(
        forcedByok || (preferredByok && (!canFallbackToKey || !isGeminiByokMarkedMissing(cacheKey!))),
      );
      if (useByok && preferredByok) {
        const byokInit = stripGoogleApiKeyHeader(requestInit);
        const byokHeaders = new Headers(byokInit.headers);
        byokHeaders.set("cf-aig-byok-alias", preferredByok);
        const response = await originalApiCall(url, { ...byokInit, headers: byokHeaders });
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
  const interactionsClient = (interactions as unknown as {
    _client?: { apiKey?: string | null };
  })._client;
  const create = interactions.create.bind(interactions);
  interactions.create = (async (params, callOptions) => {
    const useByok = Boolean(
      forcedByok || (preferredByok && (!canFallbackToKey || !isGeminiByokMarkedMissing(cacheKey!))),
    );
    if (useByok && preferredByok) {
      if (interactionsClient) interactionsClient.apiKey = null;
      try {
        return await create(params, {
          ...callOptions,
          headers: {
            ...callOptions?.headers,
            ...baseHeaders,
            "cf-aig-byok-alias": preferredByok,
            "x-goog-api-key": null as unknown as string,
          },
          maxRetries: 0,
        });
      } catch (error) {
        if (canFallbackToKey && isGatewayCredentialsRequiredError(error)) {
          missingGeminiByokUntil.set(cacheKey!, Date.now() + MISSING_BYOK_TTL_MS);
          if (interactionsClient) interactionsClient.apiKey = apiKey;
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
    if (interactionsClient && hasFallbackKey) interactionsClient.apiKey = apiKey;
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
