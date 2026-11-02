import { test, expect } from "bun:test";
import { validateProductionTarget } from "./validate-production-target";

test("production deployments reject stale Turso, staging and mismatched storage targets", () => {
  const env = { DATABASE_URL: "postgresql://synthetic:synthetic@ep-icy-art-az6oa108-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=verify-full", STORAGE_PROVIDER_MODE: "neon", AWS_REGION: "ap-southeast-1", NEON_STORAGE_BUCKET: "zyx-production", AWS_ENDPOINT_URL_S3: "https://br-polished-cell-az2cjf0y.storage.c-3.ap-southeast-1.aws.neon.tech" };
  Object.assign(env, { AWS_ACCESS_KEY_ID: "synthetic", AWS_SECRET_ACCESS_KEY: "synthetic" });
  expect(() => validateProductionTarget(env)).not.toThrow();
  expect(() => validateProductionTarget({...env,AWS_ACCESS_KEY_ID:""})).toThrow("PRODUCTION_STORAGE_CREDENTIALS_REQUIRED");
  expect(() => validateProductionTarget({...env,AWS_SECRET_ACCESS_KEY:""})).toThrow("PRODUCTION_STORAGE_CREDENTIALS_REQUIRED");
  for (const changed of [{DATABASE_URL:"libsql://source.invalid"}, {DATABASE_URL:env.DATABASE_URL.replace("ep-icy-art-az6oa108", "ep-sparkling-lab-azrp3ymj")}, {STORAGE_PROVIDER_MODE:"r2"}, {NEON_STORAGE_BUCKET:"zyx-staging"}, {AWS_REGION:"auto"}, {AWS_ENDPOINT_URL_S3:env.AWS_ENDPOINT_URL_S3.replace("br-polished-cell-az2cjf0y", "br-gentle-scene-azq0gp91")}]) {
    expect(() => validateProductionTarget({...env,...changed})).toThrow();
  }
});
