import { describe, expect, test } from "bun:test";
import {
  assertStagingEnvironment,
  fingerprintResources,
  maskValue,
  normalizeResource,
  StagingGuardError,
} from "@/lib/staging/staging-guard";

const baseEnv = {
  ZYX_ENVIRONMENT: "staging",
  ALLOW_STAGING_MUTATION: "1",
  DATABASE_URL: "libsql://zyx-staging.example.test",
  BETTER_AUTH_URL: "https://staging.example.test",
};

describe("staging guard", () => {
  test("requires the staging marker", () => {
    expect(() => assertStagingEnvironment({ env: { ...baseEnv, ZYX_ENVIRONMENT: "production" } })).toThrow(
      "MISSING_STAGING_MARKER",
    );
  });

  test("requires explicit mutation opt in", () => {
    expect(() => assertStagingEnvironment({ env: { ...baseEnv, ALLOW_STAGING_MUTATION: "0" }, requireMutation: true })).toThrow(
      "STAGING_MUTATION_NOT_ENABLED",
    );
  });

  test("rejects equality with production resources", () => {
    expect(() => assertStagingEnvironment({
      env: baseEnv,
      productionEnv: { DATABASE_URL: baseEnv.DATABASE_URL },
    })).toThrow("STAGING_RESOURCE_MATCHES_PRODUCTION");
  });

  test("rejects production-like identifiers without an allowlist", () => {
    expect(() => fingerprintResources({ ...baseEnv, R2_BUCKET: "zyx-prod-assets" })).toThrow(
      "PRODUCTION_LIKE_RESOURCE",
    );
  });

  test("allows the explicitly documented staging resource", () => {
    const resources = fingerprintResources({ ...baseEnv, R2_BUCKET: "zyx-staging" });
    expect(resources.some((resource) => resource.key === "r2Bucket")).toBe(true);
  });

  test("normalizes URLs without preserving credentials or query strings", () => {
    expect(normalizeResource("https://user:secret@Example.test/path/?token=hidden")).toBe("https://example.test/path");
  });

  test("masks short and long values", () => {
    expect(maskValue("short")).toBe("[masked]");
    expect(maskValue("abcdefghijklmno")).toBe("abcd...lmno");
  });

  test("uses typed guard errors", () => {
    try {
      assertStagingEnvironment({ env: {} });
      throw new Error("expected guard to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(StagingGuardError);
      expect((error as StagingGuardError).code).toBe("MISSING_STAGING_MARKER");
    }
  });
});
