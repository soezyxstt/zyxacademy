export const DEFAULT_AI_PROVIDERS = ["gemini", "openai", "deepseek", "muse"] as const;
export type GatewayProviderName = (typeof DEFAULT_AI_PROVIDERS)[number];
export const CONVENTION_BYOK_SLOTS = 4;

const PROVIDER_ALIASES: Readonly<Record<string, GatewayProviderName>> = {
  gemini: "gemini",
  google: "gemini",
  openai: "openai",
  deepseek: "deepseek",
  muse: "muse",
  meta: "muse",
};

export function enabledGatewayProviders(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ReadonlySet<GatewayProviderName> {
  const raw = env.AI_PROVIDERS?.trim();
  if (!raw) return new Set(DEFAULT_AI_PROVIDERS);
  const enabled = new Set<GatewayProviderName>();
  for (const part of raw.split(",")) {
    const normalized = PROVIDER_ALIASES[part.trim().toLowerCase()];
    if (normalized) enabled.add(normalized);
  }
  return enabled;
}

export function conventionByokAliases(
  provider: GatewayProviderName,
  slots: number = CONVENTION_BYOK_SLOTS,
): readonly string[] {
  return Array.from({ length: slots }, (_, index) => `${provider}_${index + 1}`);
}

function isMissingByokMessage(message: unknown): boolean {
  return typeof message === "string" && (
    message.includes("Customer-provided provider credentials are required") ||
    message.includes("has no BYOK credential named") ||
    message.includes("AI Gateway BYOK alias is not configured")
  );
}

export function isGatewayCredentialsRequiredBody(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const record = body as Record<string, unknown>;
  if (record.internalCode === 2044) return true;
  if (isMissingByokMessage(record.message)) {
    return true;
  }
  if (Array.isArray(record.error)) {
    return record.error.some(
      (item) =>
        item &&
        typeof item === "object" &&
        ((item as Record<string, unknown>).code === 2044 ||
          isMissingByokMessage((item as Record<string, unknown>).message)),
    );
  }
  return false;
}

export function isGatewayCredentialsRequiredError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const status = record.status ?? record.statusCode;
  const message = error instanceof Error ? error.message : String(error);
  if (status !== undefined && status !== 400) return false;
  return (
    message.includes("2044") ||
    isMissingByokMessage(message)
  );
}

// Accept the existing Google provider URL or its account/gateway root.
export function gatewayEndpoint(base: string | undefined, route: string) {
  const url = new URL(base ?? "");
  const match = /^\/v1\/([\w-]+)\/([\w-]+)(?:\/google-ai-studio)?\/?$/.exec(url.pathname);
  if (url.origin !== "https://gateway.ai.cloudflare.com" || url.username || url.password ||
      url.search || url.hash || !match || !/^(google-ai-studio|deepseek|openai|custom-[a-z0-9-]+)$/.test(route)) {
    throw new Error("Invalid Cloudflare AI Gateway configuration");
  }
  return url.origin + "/v1/" + match[1] + "/" + match[2] + "/" + route;
}
