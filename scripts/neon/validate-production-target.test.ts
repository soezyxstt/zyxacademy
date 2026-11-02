import { test, expect } from "bun:test";
import { validateProductionTarget } from "./validate-production-target";

test("production deployments reject stale Turso, staging and mismatched storage targets", () => {
  const env = { DATABASE_URL: "postgresql://synthetic:synthetic@ep-quiet-math-azyey0mb-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=verify-full", STORAGE_PROVIDER_MODE: "neon", AWS_REGION: "ap-southeast-1", NEON_STORAGE_BUCKET: "zyx-production", AWS_ENDPOINT_URL_S3: "https://br-wandering-butterfly-azi11h8r.storage.c-3.ap-southeast-1.aws.neon.tech" };
  Object.assign(env, { AWS_ACCESS_KEY_ID: "synthetic", AWS_SECRET_ACCESS_KEY: "synthetic" });
  expect(() => validateProductionTarget(env)).not.toThrow();
  expect(() => validateProductionTarget({...env,AWS_ACCESS_KEY_ID:""})).toThrow("PRODUCTION_STORAGE_CREDENTIALS_REQUIRED");
  expect(() => validateProductionTarget({...env,AWS_SECRET_ACCESS_KEY:""})).toThrow("PRODUCTION_STORAGE_CREDENTIALS_REQUIRED");
  expect(() => validateProductionTarget({...env,AWS_SECRET_ACCESS_KEY:"[SENSITIVE]"})).toThrow("PRODUCTION_STORAGE_CREDENTIALS_REQUIRED");
  expect(() => validateProductionTarget({...env,DATABASE_URL:"[SENSITIVE]"})).toThrow();
  for (const suffix of ["/other", "?redirect=other", "#other"]) expect(() => validateProductionTarget({...env,AWS_ENDPOINT_URL_S3:env.AWS_ENDPOINT_URL_S3+suffix})).toThrow("PRODUCTION_STORAGE_TARGET_MISMATCH");
  for (const changed of [{DATABASE_URL:"libsql://source.invalid"}, {DATABASE_URL:env.DATABASE_URL.replace("ep-quiet-math-azyey0mb", "ep-sparkling-lab-azrp3ymj")}, {STORAGE_PROVIDER_MODE:"r2"}, {NEON_STORAGE_BUCKET:"zyx-staging"}, {AWS_REGION:"auto"}, {AWS_ENDPOINT_URL_S3:env.AWS_ENDPOINT_URL_S3.replace("br-wandering-butterfly-azi11h8r", "br-gentle-scene-azq0gp91")}]) {
    expect(() => validateProductionTarget({...env,...changed})).toThrow();
  }
});
