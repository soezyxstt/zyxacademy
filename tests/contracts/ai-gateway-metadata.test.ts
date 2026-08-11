import { describe, expect, it } from "bun:test";
import { buildAiGatewayHeaders } from "@/lib/ai/gateway-metadata";

describe("Plan 005 AI Gateway metadata", () => {
  it("emits bounded metadata without raw identity or prompt payload", () => {
    const headers = buildAiGatewayHeaders({
      requestId: "request-1",
      userCohort: "a".repeat(64),
      feature: "tutor:diagnosis",
      routeClass: "premium-pedagogy",
      modelId: "gemini-3.5-flash",
      cachePolicy: "personalized",
      deadlineMs: 15_000,
    });
    const metadata = JSON.parse(headers["cf-aig-metadata"]);
    expect(Object.keys(metadata)).toHaveLength(5);
    expect(metadata.user_cohort).toBe("a".repeat(64));
    expect(metadata.feature).toBe("tutor:diagnosis");
    expect(headers["cf-aig-max-attempts"]).toBe("1");
    expect(headers["cf-aig-collect-log-payload"]).toBe("false");
    expect(headers["cf-aig-skip-cache"]).toBe("true");
  });

  it("allows caching only for an explicit public scaffold policy", () => {
    const headers = buildAiGatewayHeaders({
      requestId: "request-1",
      userCohort: "a".repeat(64),
      feature: "tutor:scaffold",
      routeClass: "default",
      modelId: "gemini-3.1-flash-lite",
      cachePolicy: "public_scaffold",
      deadlineMs: 15_000,
    });
    expect(headers["cf-aig-skip-cache"]).toBeUndefined();
  });

  it("uses one canonical profile-free cache key with a bounded TTL", () => {
    const headers = buildAiGatewayHeaders({
      requestId: "request-1",
      userCohort: "a".repeat(64),
      feature: "tutor:scaffold",
      routeClass: "default",
      modelId: "gemini-3.1-flash-lite",
      cachePolicy: "public_scaffold",
      cacheKey: `zyra:exact:v1:${"b".repeat(64)}`,
      cacheTtlSeconds: 999_999_999,
      deadlineMs: 15_000,
    });
    expect(headers["cf-aig-cache-key"]).toBe(`zyra:exact:v1:${"b".repeat(64)}`);
    expect(headers["cf-aig-cache-ttl"]).toBe(String(60 * 60 * 24 * 30));
    expect(() => buildAiGatewayHeaders({
      requestId: "request-1",
      userCohort: "a".repeat(64),
      feature: "tutor:scaffold",
      routeClass: "default",
      modelId: "gemini-3.1-flash-lite",
      cachePolicy: "personalized",
      cacheKey: `zyra:exact:v1:${"b".repeat(64)}`,
      deadlineMs: 15_000,
    })).toThrow();
  });
});
