import { GoogleGenAI } from "@google/genai";
import { gatewayEndpoint } from "./gateway";

export function googleGatewayClient(
  apiKey: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
  timeout?: number,
  metadata: Readonly<Record<string, string>> = {},
) {
  const baseUrl = gatewayEndpoint(env.CF_AI_GATEWAY_URL, "google-ai-studio");
  if (!env.CF_AI_GATEWAY_TOKEN) throw new Error("Cloudflare AI Gateway token unavailable");
  const headers = {
    "cf-aig-skip-cache": "true",
    ...metadata,
    "cf-aig-max-attempts": "1",
    "cf-aig-collect-log-payload": "false",
    "cf-aig-authorization": "Bearer " + env.CF_AI_GATEWAY_TOKEN,
  };
  const client = new GoogleGenAI({
    apiKey, vertexai: false,
    httpOptions: { baseUrl, timeout, retryOptions: { attempts: 1 }, headers },
  });
  // The Interactions transport drops SDK-level headers. Supply them per call.
  const interactions = client.interactions;
  const create = interactions.create.bind(interactions);
  interactions.create = ((params, options) =>
    create(params, { ...options, headers: { ...options?.headers, ...headers }, maxRetries: 0 })
  ) as typeof interactions.create;
  return client;
}
