import { expect, test } from "bun:test";
import { assertProductV4LocalSource, productV4LocalInput, loadProductV4LocalSettings } from "../../scripts/authoring/verify-product-v4-local";
import { assertProductV4LocalTarget, assertProductV4LocalDraft } from "@/lib/compute/product-v4-local-operator";

const target = { DATABASE_URL: "postgresql://synthetic:synthetic@ep-quiet-math-azyey0mb-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=verify-full", STORAGE_PROVIDER_MODE: "neon", AWS_REGION: "ap-southeast-1", NEON_STORAGE_BUCKET: "zyx-production", AWS_ENDPOINT_URL_S3: "https://br-wandering-butterfly-azi11h8r.storage.c-3.ap-southeast-1.aws.neon.tech", AWS_ACCESS_KEY_ID: "synthetic", AWS_SECRET_ACCESS_KEY: "synthetic", ZYX_ENVIRONMENT: "production", ZYX_MCP_ENVIRONMENT: "production", NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "https://www.zyxacademy.com", BETTER_AUTH_URL: "https://www.zyxacademy.com", AUTHORING_VERIFICATION_BROWSER_PROVIDER: "local_playwright" };

test("operator source guard binds actual clean checkout and canonical remote to the selected SHA", () => {
  const sha = "a".repeat(40);
  const source = { head: sha, status: "", origin: "https://github.com/soezyxstt/zyxacademy.git" };
  expect(() => assertProductV4LocalSource(sha, source)).not.toThrow();
  for (const change of [{ head: "b".repeat(40) }, { status: " M lib/example.ts" }, { status: "?? untracked.ts" }, { origin: "https://example.com/soezyxstt/zyxacademy.git" }]) expect(() => assertProductV4LocalSource(sha, { ...source, ...change })).toThrow("SOURCE_REQUIRED");
});

test("operator requires real production targets and rejects hosted execution or embedded overrides", () => {
  expect(() => assertProductV4LocalTarget(target, false)).not.toThrow();
  expect(() => assertProductV4LocalTarget(target, true)).toThrow("CONTEXT_REQUIRED");
  for (const change of [{ DATABASE_URL: target.DATABASE_URL.replace("ep-quiet-math-azyey0mb-pooler", "ep-staging") }, { NEON_STORAGE_BUCKET: "zyx-staging" }, { NEXT_PUBLIC_APP_URL: "https://staging.zyxacademy.com" }, { ZYX_ENVIRONMENT: "staging" }, { GITHUB_ACTIONS: "true" }, { VERCEL: "1" }, { ZYX_COMPUTE_RUNTIME: "neon" }, { ZYX_COMPUTE_BUILD_RUNTIME: "{}" }, { NEXT_PUBLIC_V4_WEB_RUNTIME: "{}" }, { AUTHORING_VERIFICATION_BROWSER_PROVIDER: "cloudflare" }]) expect(() => assertProductV4LocalTarget({ ...target, ...change }, false)).toThrow();
});

test("operator selects an explicit draft, run and checksum and cannot choose latest", () => {
  const args = ["--private-env", "private.json", "--source-sha", "a".repeat(40), "--import-id", `impor-product-${"a".repeat(32)}`, "--run-id", "mcp-run-00000000-0000-4000-8000-000000000000", "--checksum", "b".repeat(64)];
  const input = productV4LocalInput(args);
  expect(input.expectedChecksum).toBe("b".repeat(64));
  for (const bad of [args.slice(0, -2), [...args, "--checksum", "c".repeat(64)], [...args.slice(0, -1), "latest"], [...args, "--unknown", "x"]]) expect(() => productV4LocalInput(bad)).toThrow("EXACT_INPUT_REQUIRED");
  const row = { bundleType: "product", version: 4, status: "draft", checksum: input.expectedChecksum, validationReport: { productV4Verification: { runId: input.runId } } };
  expect(() => assertProductV4LocalDraft(row, input)).not.toThrow();
  for (const change of [{ status: "published" }, { checksum: "c".repeat(64) }, { validationReport: { productV4Verification: { runId: "another" } } }]) expect(() => assertProductV4LocalDraft({ ...row, ...change }, input)).toThrow("EXACT_DRAFT_REQUIRED");
});

test("private settings cannot forge source provenance or executable runtime environment", () => {
  const sha = "a".repeat(40);
  expect(loadProductV4LocalSettings({ sourceRevision: sha, environment: target }, sha)).toEqual(target);
  for (const environment of [{ ...target, GITHUB_ACTIONS: "true" }, { ...target, NODE_OPTIONS: "--import unsafe" }, { ...target, PATH: "unsafe" }, { ...target, V4_EXPECTED_CHECKSUM: "fake" }]) expect(() => loadProductV4LocalSettings({ sourceRevision: sha, environment }, sha)).toThrow("SETTINGS_INVALID");
  expect(() => loadProductV4LocalSettings({ sourceRevision: "b".repeat(40), environment: target }, sha)).toThrow("SETTINGS_INVALID");
});
