import { expect, test } from "bun:test";
import { acquireLocalProductOperatorLock, cleanupOwnedV4ImportLock } from "../../scripts/authoring/local-product-operator-lock.mjs";
import { readFile } from "node:fs/promises";
import { mkdtemp, rm, mkdir, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { acquireProductV4LocalLock, assertProductV4LocalSource, isProductV4LocalArtifactId, productV4LocalFailure, productV4LocalInput, loadProductV4LocalSettings, validateProductV4LocalInput } from "../../scripts/authoring/verify-product-v4-local";
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
  const row = { bundleType: "product", version: 4, status: "draft", checksum: input.expectedChecksum, validationReport: {} };
  const staging = { action: "draft_created", correlationId: input.runId, afterSnapshot: { checksum: input.expectedChecksum } };
  expect(() => assertProductV4LocalDraft(row, input, staging)).not.toThrow();
  expect(() => assertProductV4LocalDraft({ ...row, validationReport: { productV4Verification: { runId: input.runId } } }, input, staging)).not.toThrow();
  expect(() => assertProductV4LocalDraft({ ...row, validationReport: { productV4Verification: { runId: "another" } } }, input, staging)).not.toThrow();
  for (const change of [{ status: "published" }, { checksum: "c".repeat(64) }]) expect(() => assertProductV4LocalDraft({ ...row, ...change }, input, staging)).toThrow("EXACT_DRAFT_REQUIRED");
  for (const change of [{ action: "other" }, { correlationId: "another" }, { afterSnapshot: { checksum: "c".repeat(64) } }]) expect(() => assertProductV4LocalDraft(row, input, { ...staging, ...change })).toThrow("EXACT_DRAFT_REQUIRED");
  expect(() => assertProductV4LocalDraft(row, input, null)).toThrow("EXACT_DRAFT_REQUIRED");
  expect(validateProductV4LocalInput({ ...input, retry: true }).retry).toBe(true);
  for (const bad of [{ ...input, retry: "true" }, { ...input, runId: "mcp-run-" + "-".repeat(36) }, { ...input, extra: 1 }]) expect(() => validateProductV4LocalInput(bad)).toThrow("EXACT_INPUT_REQUIRED");
});

test("local lock serializes a draft on this machine and can be reacquired after release", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "v4-local-lock-"));
  const importId = `impor-product-${"a".repeat(32)}`;
  try {
    const release = await acquireProductV4LocalLock(importId, root);
    await expect(acquireProductV4LocalLock(importId, root)).rejects.toThrow("ATTEMPT_LOCKED");
    await release();
    await (await acquireProductV4LocalLock(importId, root))();
    await expect(acquireProductV4LocalLock("../other", root)).rejects.toThrow("EXACT_INPUT_REQUIRED");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("artifact export accepts only exact attempt filenames and failures never print arbitrary errors", () => {
  const attempt = "00000000-0000-4000-8000-000000000000";
  const file = `artifact-${attempt}-${"b".repeat(64)}-0.png`;
  expect(isProductV4LocalArtifactId(file, attempt)).toBe(true);
  for (const bad of [file.replace(".png", "xpng"), `../${file}`, file.replace(attempt, "10000000-0000-4000-8000-000000000000")]) expect(isProductV4LocalArtifactId(bad, attempt)).toBe(false);
  expect(JSON.stringify(productV4LocalFailure(new Error("secret https://private")))).not.toContain("secret");
  expect(productV4LocalFailure(new Error("PRODUCT_V4_LOCAL_EXACT_DRAFT_REQUIRED")).recovery).toContain("staging run");
});

test("private settings cannot forge source provenance or executable runtime environment", () => {
  const sha = "a".repeat(40);
  expect(loadProductV4LocalSettings({ sourceRevision: sha, environment: target }, sha)).toEqual(target);
  for (const environment of [{ ...target, GITHUB_ACTIONS: "true" }, { ...target, NODE_OPTIONS: "--import unsafe" }, { ...target, PATH: "unsafe" }, { ...target, V4_EXPECTED_CHECKSUM: "fake" }]) expect(() => loadProductV4LocalSettings({ sourceRevision: sha, environment }, sha)).toThrow("SETTINGS_INVALID");
  expect(() => loadProductV4LocalSettings({ sourceRevision: "b".repeat(40), environment: target }, sha)).toThrow("SETTINGS_INVALID");
});


test("local launchers serialize different imports and profiles before bundling private modules", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "product-machine-lock-"));
  const lock = path.join(root, "machine.lock");
  try {
    const release = await acquireLocalProductOperatorLock(lock);
    await expect(acquireLocalProductOperatorLock(lock)).rejects.toThrow("PRODUCT_LOCAL_OPERATOR_LOCKED");
    await release();
    await (await acquireLocalProductOperatorLock(lock))();
    for (const profile of ["v4", "legacy"]) {
      const source = await readFile(`scripts/authoring/run-product-${profile}-local.mjs`, "utf8");
      expect(source.indexOf("releaseLock = await acquireLocalProductOperatorLock()")).toBeLessThan(source.indexOf("await build("));
      expect(source).toContain('await mkdtemp(path.join(root, ".launcher-"))');
      expect(source).toContain('if (releaseLock) await releaseLock()');
      expect(source).not.toContain('spawnSync');
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});


test("stopped-child cleanup removes only that child owned import lock", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "v4-owned-cleanup-"));
  const id = `impor-product-${"a".repeat(32)}`;
  const lock = path.join(root, id, ".lock");
  try {
    await mkdir(lock, { recursive: true });
    await writeFile(path.join(lock, "owner.json"), JSON.stringify({ pid: 12345 }));
    await cleanupOwnedV4ImportLock(["--import-id", id], 54321, root);
    expect((await stat(lock)).isDirectory()).toBe(true);
    await cleanupOwnedV4ImportLock(["--import-id", id], 12345, root);
    await expect(stat(lock)).rejects.toThrow();
    for (const profile of ["v4", "legacy"]) {
      const source = await readFile(`scripts/authoring/run-product-${profile}-local.mjs`, "utf8");
      expect(source.indexOf('process.once("SIGTERM", onSignal)')).toBeLessThan(source.indexOf("releaseLock = await acquireLocalProductOperatorLock()"));
      expect(source).not.toContain("process.exit(1)");
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
