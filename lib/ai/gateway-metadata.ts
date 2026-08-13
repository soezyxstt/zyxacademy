export type GatewayCachePolicy = "public_scaffold" | "personalized" | "active_assessment" | "bypass";

export type GatewayMetadataInput = {
  readonly requestId: string;
  readonly userCohort: string;
  readonly feature: string;
  readonly routeClass: string;
  readonly modelId: string;
  readonly cachePolicy?: GatewayCachePolicy;
  readonly cacheKey?: string;
  readonly cacheTtlSeconds?: number;
  readonly deadlineMs: number;
};

function boundedMetadataValue(value: string): string {
  return value.replace(/[^A-Za-z0-9._:-]/g, "_").slice(0, 80);
}

/** Builds only bounded, privacy-safe AI Gateway request controls. */
export function buildAiGatewayHeaders(input: GatewayMetadataInput): Record<string, string> {
  const metadata = {
    model: boundedMetadataValue(input.modelId),
    route_class: boundedMetadataValue(input.routeClass),
    user_cohort: input.userCohort,
    app_request_id: boundedMetadataValue(input.requestId),
    feature: boundedMetadataValue(input.feature),
  };
  const headers: Record<string, string> = {
    "cf-aig-metadata": JSON.stringify(metadata),
    "cf-aig-max-attempts": "1",
    "cf-aig-request-timeout": String(input.deadlineMs),
    "cf-aig-collect-log-payload": "false",
  };
  if (input.cachePolicy !== "public_scaffold") headers["cf-aig-skip-cache"] = "true";
  if (input.cacheKey !== undefined) {
    if (input.cachePolicy !== "public_scaffold" || !/^zyra:exact:v1:[a-f0-9]{64}$/i.test(input.cacheKey)) {
      throw new Error("AI Gateway cache keys are limited to profile-free Zyra exact keys");
    }
    const ttl = Number.isFinite(input.cacheTtlSeconds)
      ? Math.min(60 * 60 * 24 * 30, Math.max(60, Math.floor(input.cacheTtlSeconds as number)))
      : 60 * 60 * 24;
    headers["cf-aig-cache-key"] = input.cacheKey;
    headers["cf-aig-cache-ttl"] = String(ttl);
  }
  return headers;
}
