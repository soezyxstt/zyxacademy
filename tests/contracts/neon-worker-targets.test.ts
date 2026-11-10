import { expect, test } from "bun:test";
import { workerTarget, assertWorkerEnvironment } from "../../scripts/neon/worker-targets.mjs";

test("production deployment rejects staging resources before any API mutation", () => {
  const target = workerTarget("production");
  const valid = { ZYX_ENVIRONMENT: "production", ZYX_MCP_ENVIRONMENT: "production", INNGEST_ENV: target.inngestEnvironment,
    DATABASE_URL: `postgresql://fixture:fixture@${target.databaseHost}/neondb?sslmode=verify-full`,
    AWS_ENDPOINT_URL_S3: `https://${target.branch}.storage.c-3.ap-southeast-1.aws.neon.tech`, AWS_REGION: "ap-southeast-1", STORAGE_PROVIDER_MODE: "neon",
    NEON_STORAGE_BUCKET: target.bucket, NEXT_PUBLIC_APP_URL: target.appOrigin, DIKTAT_RENDERER_URL: target.rendererOrigin };
  expect(() => assertWorkerEnvironment(target, valid)).not.toThrow();
  for (const patch of [{ ZYX_ENVIRONMENT: "staging" }, { INNGEST_ENV: "staging-40f1da25" }, { DATABASE_URL: valid.DATABASE_URL.replace(target.databaseHost, workerTarget("staging").databaseHost) },
    { NEON_STORAGE_BUCKET: "zyx-staging" }, { AWS_ENDPOINT_URL_S3: `https://${workerTarget("staging").branch}.storage.c-3.ap-southeast-1.aws.neon.tech` },
    { NEXT_PUBLIC_APP_URL: "https://staging.zyxacademy.com" }, { DIKTAT_RENDERER_URL: workerTarget("staging").rendererOrigin }]) {
    expect(() => assertWorkerEnvironment(target, { ...valid, ...patch })).toThrow();
  }
  expect(() => workerTarget(undefined)).toThrow("COMPUTE_ENVIRONMENT_REQUIRED");
  expect(() => workerTarget("production ")).toThrow("COMPUTE_ENVIRONMENT_REQUIRED");
});
