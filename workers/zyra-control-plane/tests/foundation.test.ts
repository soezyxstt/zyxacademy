import { describe, expect, test } from "bun:test";
import { extractBearerToken, isAuthorizedRequest } from "../src/auth";
import {
  buildHealthPayload,
  validatePrivateAttachmentPolicy,
  validateSemanticCacheContract
} from "../src/contracts";

describe("Zyra control-plane authentication", () => {
  test("accepts the exact bearer token", async () => {
    const request = new Request("https://zyra.test/private", {
      headers: { authorization: "Bearer staging-token" }
    });

    expect(extractBearerToken(request)).toBe("staging-token");
    expect(await isAuthorizedRequest(request, "staging-token")).toBe(true);
  });

  test("rejects missing, malformed, and wrong tokens", async () => {
    expect(await isAuthorizedRequest(new Request("https://zyra.test/private"), "staging-token")).toBe(false);
    expect(
      await isAuthorizedRequest(
        new Request("https://zyra.test/private", {
          headers: { authorization: "Basic staging-token" }
        }),
        "staging-token"
      )
    ).toBe(false);
    expect(
      await isAuthorizedRequest(
        new Request("https://zyra.test/private", {
          headers: { authorization: "Bearer other-token" }
        }),
        "staging-token"
      )
    ).toBe(false);
  });
});

describe("Zyra Plan 001 contracts", () => {
  test("rejects a cache contract that could target a preserved 1024-dimensional index", () => {
    expect(validateSemanticCacheContract({ dimensions: 1024, metric: "cosine" })).toEqual([
      "dimensions must be 768"
    ]);
    expect(validateSemanticCacheContract({ dimensions: 768, metric: "cosine" })).toEqual([]);
  });

  test("requires a private, prefixed, seven-day attachment policy", () => {
    expect(
      validatePrivateAttachmentPolicy({
        publicAccess: false,
        prefix: "zyx-attachments/",
        retentionDays: 7
      })
    ).toEqual([]);
    expect(
      validatePrivateAttachmentPolicy({
        publicAccess: true,
        prefix: "wrong/",
        retentionDays: 30
      })
    ).toHaveLength(3);
  });

  test("health payload exposes aliases and booleans, never credentials or IDs", () => {
    const health = buildHealthPayload({
      ZYX_ENVIRONMENT: "staging",
      ZYRA_DEPLOYMENT_VERSION: "plan-001-test",
      ZYRA_CONTROL_PLANE_TOKEN: "secret-value",
      ZYX_STAGING_KV: {} as KVNamespace,
      ZYRA_PRIVATE_ATTACHMENTS: {} as R2Bucket,
      ZYRA_SEMANTIC_CACHE: {} as VectorizeIndex,
      ZYRA_ANALYTICS: {} as AnalyticsEngineDataset,
      ZYRA_QUOTA_COORDINATOR: {} as WorkerEnv["ZYRA_QUOTA_COORDINATOR"]
    });
    const serialized = JSON.stringify(health);

    expect(health.auth.controlPlaneTokenConfigured).toBe(true);
    expect(serialized).not.toContain("secret-value");
    expect(serialized).not.toContain("e44404ea69ba431bb0c68046475e45cf");
    expect(health.resources.semanticCacheDimensions).toBe(768);
    expect(health.resources.semanticCacheMetric).toBe("cosine");
  });
});
