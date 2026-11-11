import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { assertProductV4CiContext, assertProductV4CiTarget, productV4CiInput } from "../../scripts/authoring/verify-product-v4-ci";
import { requestProductV4VerificationInGithubActions } from "@/lib/bundle/product-v4-verification-service";

const context = { GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "soezyxstt/zyxacademy", GITHUB_REF: "refs/heads/main", GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_SHA: "a".repeat(40) };
const target = { ...context, DATABASE_URL: "postgresql://synthetic:synthetic@ep-quiet-math-azyey0mb-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=verify-full", STORAGE_PROVIDER_MODE: "neon", AWS_REGION: "ap-southeast-1", NEON_STORAGE_BUCKET: "zyx-production", AWS_ENDPOINT_URL_S3: "https://br-wandering-butterfly-azi11h8r.storage.c-3.ap-southeast-1.aws.neon.tech", AWS_ACCESS_KEY_ID: "synthetic", AWS_SECRET_ACCESS_KEY: "synthetic", ZYX_ENVIRONMENT: "production", ZYX_MCP_ENVIRONMENT: "production", NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "https://www.zyxacademy.com", BETTER_AUTH_URL: "https://www.zyxacademy.com", AUTHORING_VERIFICATION_BROWSER_PROVIDER: "github_actions" };

test("CI command requires the exact repository, main ref, manual event and commit identity", () => {
  expect(() => assertProductV4CiContext(context)).not.toThrow();
  for (const change of [{ GITHUB_ACTIONS: "false" }, { GITHUB_REPOSITORY: "another/repo" }, { GITHUB_REF: "refs/heads/staging" }, { GITHUB_EVENT_NAME: "pull_request" }, { GITHUB_SHA: "" }]) expect(() => assertProductV4CiContext({ ...context, ...change })).toThrow("CI_CONTEXT_REQUIRED");
});

test("CI target guard rejects the wrong database, storage, origin or embedded runtime", () => {
  expect(() => assertProductV4CiTarget(target)).not.toThrow();
  for (const change of [
    { DATABASE_URL: target.DATABASE_URL.replace("ep-quiet-math-azyey0mb-pooler", "ep-staging") },
    { NEON_STORAGE_BUCKET: "zyx-staging" }, { AWS_ENDPOINT_URL_S3: "https://other.storage.example" },
    { NEXT_PUBLIC_APP_URL: "https://staging.zyxacademy.com" }, { BETTER_AUTH_URL: "https://staging.zyxacademy.com" },
    { ZYX_ENVIRONMENT: "staging" }, { NODE_ENV: "development" }, { AUTHORING_VERIFICATION_BROWSER_PROVIDER: "cloudflare" },
    { ZYX_COMPUTE_RUNTIME: "neon" }, { ZYX_COMPUTE_BUILD_RUNTIME: "{}" }, { NEXT_PUBLIC_V4_WEB_RUNTIME: "{}" },
  ]) expect(() => assertProductV4CiTarget({ ...target, ...change })).toThrow();
});

test("CI verification selects an explicit import, run and checksum without choosing a draft", () => {
  const env = { V4_IMPORT_ID: `impor-product-${"a".repeat(32)}`, V4_RUN_ID: "mcp-run-00000000-0000-4000-8000-000000000000", V4_EXPECTED_CHECKSUM: "b".repeat(64) };
  expect(productV4CiInput(env)).toEqual({ importId: env.V4_IMPORT_ID, runId: env.V4_RUN_ID, expectedChecksum: env.V4_EXPECTED_CHECKSUM });
  for (const change of [{ V4_IMPORT_ID: "" }, { V4_RUN_ID: "" }, { V4_EXPECTED_CHECKSUM: "" }, { V4_EXPECTED_CHECKSUM: "latest" }]) expect(() => productV4CiInput({ ...env, ...change })).toThrow("CI_EXACT_INPUT_REQUIRED");
});

test("application CI request rejects ordinary execution before loading production modules", async () => {
  const old = process.env.GITHUB_ACTIONS;
  try {
    process.env.GITHUB_ACTIONS = "false";
    await expect(requestProductV4VerificationInGithubActions({ importId: "import", runId: "run", expectedChecksum: "a".repeat(64) })).rejects.toThrow("CI_CONTEXT_REQUIRED");
  } finally { if (old === undefined) delete process.env.GITHUB_ACTIONS; else process.env.GITHUB_ACTIONS = old; }
});

test("workflow isolates prepared secrets from the downloadable evidence and never publishes", async () => {
  const workflow = await readFile(new URL("../../.github/workflows/verify-product-v4.yml", import.meta.url), "utf8");
  expect(workflow).toContain("environment: production");
  expect(workflow).toContain("github.ref == 'refs/heads/main'");
  expect(workflow).toContain("cancel-in-progress: false");
  expect(workflow).toContain("prepare_worker_runtime.py artifacts/v4-ci-private/.env.runtime.json");
  expect(workflow).toContain("path: artifacts/v4-ci-evidence/");
  expect(workflow).not.toContain("path: artifacts/v4-ci-private");
  expect(workflow).not.toMatch(/(?:deploy|publish|set_publication)/i);
});
