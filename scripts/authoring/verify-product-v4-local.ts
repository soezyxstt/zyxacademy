import { writeFileSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { mkdir, readFile, rmdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { assertProductV4LocalTarget } from "../../lib/compute/product-v4-local-operator";

const outputRoot = "artifacts/v4-local-evidence";
type LocalInput = { privateFile: string; sourceRevision: string; importId: string; runId: string; expectedChecksum: string; retry?: boolean };

export function assertProductV4LocalSource(expected: string, source: { head: string; status: string; origin: string }) {
  if (!/^[a-f0-9]{40}$/.test(expected) || source.head.trim() !== expected || source.status.trim() || !/^(?:https:\/\/github\.com\/|git@github\.com:)soezyxstt\/zyxacademy(?:\.git)?$/.test(source.origin.trim())) throw new Error("PRODUCT_V4_LOCAL_SOURCE_REQUIRED");
}

export function validateProductV4LocalInput(value: unknown): LocalInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("PRODUCT_V4_LOCAL_EXACT_INPUT_REQUIRED");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !["privateFile", "sourceRevision", "importId", "runId", "expectedChecksum", "retry"].includes(key)) || typeof input.privateFile !== "string" || !input.privateFile || input.privateFile.includes("\0") || typeof input.sourceRevision !== "string" || !/^[a-f0-9]{40}$/.test(input.sourceRevision) || typeof input.importId !== "string" || !/^impor-product-[a-f0-9]{32}$/.test(input.importId) || typeof input.runId !== "string" || !/^mcp-run-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(input.runId) || typeof input.expectedChecksum !== "string" || !/^[a-f0-9]{64}$/.test(input.expectedChecksum) || (input.retry !== undefined && typeof input.retry !== "boolean")) throw new Error("PRODUCT_V4_LOCAL_EXACT_INPUT_REQUIRED");
  return input as LocalInput;
}

export function productV4LocalInput(args: string[]) {
  const names = ["--private-env", "--source-sha", "--import-id", "--run-id", "--checksum"];
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    if (!names.includes(args[i]) || values.has(args[i]) || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error("PRODUCT_V4_LOCAL_EXACT_INPUT_REQUIRED");
    values.set(args[i], args[i + 1]);
  }
  return validateProductV4LocalInput({ privateFile: values.get("--private-env"), sourceRevision: values.get("--source-sha"), importId: values.get("--import-id"), runId: values.get("--run-id"), expectedChecksum: values.get("--checksum") });
}

async function readBoundedJson(file: string, maxBytes: number) {
  try {
    const metadata = await stat(file);
    if (!metadata.isFile() || metadata.size > maxBytes) throw new Error();
    return JSON.parse(await readFile(file, "utf8"));
  } catch { throw new Error("PRODUCT_V4_LOCAL_INPUT_FILE_INVALID"); }
}

export async function acquireProductV4LocalLock(importId: string, root = outputRoot) {
  if (!/^impor-product-[a-f0-9]{32}$/.test(importId)) throw new Error("PRODUCT_V4_LOCAL_EXACT_INPUT_REQUIRED");
  const parent = path.resolve(root, importId);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const lock = path.join(parent, ".lock");
  try { await mkdir(lock, { mode: 0o700 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("PRODUCT_V4_LOCAL_ATTEMPT_LOCKED"); throw error; }
  try { writeFileSync(path.join(lock, "owner.json"), JSON.stringify({ pid: process.pid }), { mode: 0o600, flag: "wx" }); }
  catch (error) { await rmdir(lock); throw error; }
  return async () => { unlinkSync(path.join(lock, "owner.json")); await rmdir(lock); };
}

export function isProductV4LocalArtifactId(id: string, attemptId: string): boolean {
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(attemptId) && new RegExp(`^artifact-${attemptId}-[a-f0-9]{64}-[0-9]+\\.(png|pdf|json)$`).test(id);
}

export function loadProductV4LocalSettings(settings: unknown, sourceRevision: string): Record<string, string> {
  const parsed = settings as { sourceRevision?: unknown; environment?: unknown } | null;
  if (!parsed || parsed.sourceRevision !== sourceRevision || !parsed.environment || typeof parsed.environment !== "object" || Array.isArray(parsed.environment)) throw new Error("PRODUCT_V4_LOCAL_SETTINGS_INVALID");
  const environment: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed.environment)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key) || /^(?:GITHUB_|V4_|NODE_OPTIONS$|BUN_OPTIONS$|PATH$|NODE_PATH$|LD_)/.test(key) || typeof value !== "string") throw new Error("PRODUCT_V4_LOCAL_SETTINGS_INVALID");
    environment[key] = value;
  }
  if (environment.AUTHORING_VERIFICATION_BROWSER_PROVIDER !== "local_playwright") throw new Error("PRODUCT_V4_LOCAL_SETTINGS_INVALID");
  return environment;
}

export function productV4LocalFailure(error: unknown) {
  const code = error instanceof Error && /^(?:PRODUCT_V4_|VERIFICATION_)[A-Z0-9_]+$/.test(error.message) ? error.message : "PRODUCT_V4_LOCAL_EXECUTION_FAILED";
  const recovery: Record<string, string> = {
    PRODUCT_V4_LOCAL_EXACT_INPUT_REQUIRED: "Provide the exact draft input JSON and retry.",
    PRODUCT_V4_LOCAL_INPUT_FILE_INVALID: "Check the JSON file is readable, valid and within the documented size limit.",
    PRODUCT_V4_LOCAL_SOURCE_REQUIRED: "Use the clean checkout of the exact deployed source revision.",
    PRODUCT_V4_LOCAL_EXACT_DRAFT_REQUIRED: "Refresh the staged draft, checksum and original staging run. A restaged or published draft requires a new decision.",
    PRODUCT_V4_LOCAL_ATTEMPT_LOCKED: "Wait for the local verifier. If its process has exited, remove the documented lock directory and retry.",
    PRODUCT_V4_LOCAL_ATTEMPT_RUNNING: "Wait for the current attempt or its lease to expire before retrying.",
    PRODUCT_V4_LOCAL_RETRY_REQUIRED: "Inspect the previous receipt and set retry to true only after correcting the failure.",
    PRODUCT_V4_LOCAL_VERIFICATION_NOT_READY: "Inspect the exported plan, receipt and artifacts, fix failures and restage if needed.",
    PRODUCT_V4_VERIFICATION_CONFLICT: "Refresh the draft and dependencies, then verify the new exact revision.",
    PRODUCT_V4_BROWSER_VERSION_MISMATCH: "Install the pinned Playwright Chromium shown by --capabilities.",
    PRODUCT_V4_LOCAL_CHROMIUM_PIN_MISMATCH: "Align the reviewed provider pin and installed Playwright manifest with the deployed revision.",
  };
  return { status: "error", code, recovery: recovery[code] ?? "Check the documented local prerequisites and exact target, then retry without exposing credentials." };
}

export async function runProductV4LocalVerification() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--capabilities") {
    if (process.env.ZYX_COMPUTE_RUNTIME || process.env.ZYX_COMPUTE_BUILD_RUNTIME || process.env.NEXT_PUBLIC_V4_WEB_RUNTIME) throw new Error("PRODUCT_V4_LOCAL_CONTEXT_REQUIRED");
    // The playbook module initializes the database adapter on import. Discovery must not connect to a real target.
    const previousDatabase = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder";
    try {
      const [runtime, { verificationBrowserIdentity }] = await Promise.all([import("../../lib/compute/product-v4-runtime-binding"), import("../../lib/compute/product-v4-browser-config")]);
      const chromium = runtime.expectedChromiumRuntime();
      const configured = verificationBrowserIdentity({ NODE_ENV: "production", AUTHORING_VERIFICATION_BROWSER_PROVIDER: "local_playwright" } as NodeJS.ProcessEnv);
      console.log(JSON.stringify({ schema: "zyx-product-v4-local-capabilities.v1", operator: { launcher: "scripts/authoring/run-product-v4-local.mjs", command: "node scripts/authoring/run-product-v4-local.mjs --input <input.json>", inputSchema: "zyx-product-v4-local-input.v1", requiredFields: ["privateFile", "sourceRevision", "importId", "runId", "expectedChecksum"], optionalFields: ["retry"], resultSchema: "zyx-product-v4-local-result.v1", target: "verified-production-only", deployedRevisionCheck: "operator-prerequisite", deployedRevisionSource: "authorized deployment record; not inferred from local HEAD" }, browser: { ...chromium, provider: configured.browserProvider, configuredVersion: configured.browserVersion, pinsMatch: configured.browserVersion === chromium.browserVersion }, runtime: await runtime.readProductV4RuntimeFingerprint(), concurrency: 1 }));
    } finally {
      if (previousDatabase === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabase;
    }
    return;
  }
  const input = args.length === 2 && args[0] === "--input" ? validateProductV4LocalInput(await readBoundedJson(args[1], 16 * 1024)) : productV4LocalInput(args);
  const git = (...gitArgs: string[]) => execFileSync("git", ["-c", "core.fsmonitor=false", ...gitArgs], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  // sourceRevision must be obtained from the authorized deployment record. This
  // verifies local identity only; the current CLI does not discover deployed Git HEAD.
  const assertSource = () => assertProductV4LocalSource(input.sourceRevision, { head: git("rev-parse", "HEAD"), status: git("status", "--porcelain", "--untracked-files=normal"), origin: git("remote", "get-url", "origin") });
  assertSource();
  const root = path.resolve(git("rev-parse", "--show-toplevel"));
  const privateFile = path.resolve(input.privateFile);
  const relative = path.relative(root, privateFile);
  if (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
    try { git("check-ignore", "--quiet", "--", relative); } catch { throw new Error("PRODUCT_V4_LOCAL_PRIVATE_FILE_MUST_BE_IGNORED"); }
  }
  Object.assign(process.env, loadProductV4LocalSettings(await readBoundedJson(privateFile, 128 * 1024), input.sourceRevision));
  assertProductV4LocalTarget(process.env);
  const unlock = await acquireProductV4LocalLock(input.importId);
  try {
    // Environment-sensitive application modules are loaded only after the private settings.
    const [service, executor, runner, runtime, { storage }, { buildProductVerificationKey }, { verificationBrowserIdentity }] = await Promise.all([
      import("../../lib/bundle/product-v4-verification-service"), import("../../lib/compute/product-v4-verification-executor"),
      import("../../lib/compute/product-v4-browser-runner"), import("../../lib/compute/product-v4-runtime-binding"),
      import("../../lib/storage"), import("../../lib/storage/keys"), import("../../lib/compute/product-v4-browser-config"),
    ]);
    try {
      const chromium = runtime.expectedChromiumRuntime();
      if (verificationBrowserIdentity().browserVersion !== chromium.browserVersion) throw new Error("PRODUCT_V4_LOCAL_CHROMIUM_PIN_MISMATCH");
      assertSource();
      const selectedInput = { importId: input.importId, runId: input.runId, expectedChecksum: input.expectedChecksum };
      // The service reads the exact draft and its latest staging audit before any write.
      const requested = await service.requestProductV4VerificationLocally({ ...selectedInput, retry: input.retry });
      if (["failed", "stale"].includes(requested.state.status)) {
        console.log(JSON.stringify({ schema: "zyx-product-v4-local-result.v1", status: requested.state.status, importId: input.importId, runId: input.runId, checksum: input.expectedChecksum, planHash: requested.plan.planHash, attemptId: requested.attemptId, failureCode: requested.state.failureCode ?? null }));
        throw new Error("PRODUCT_V4_LOCAL_RETRY_REQUIRED");
      }
      let result;
      try {
        result = await service.processProductV4VerificationJob({ importId: input.importId, runId: input.runId, planHash: requested.plan.planHash, attemptId: requested.attemptId }, undefined, async check => {
          assertSource();
          if (check.requirement.layer === "structure" || check.requirement.layer === "model") return executor.executeProductV4VerificationCheck(check);
          const staticFigureAssets = await runtime.loadProductV4StaticFigureAssets(check.bundle, undefined, check.requirement.layer === "print");
          const interactiveDocumentAssets = await runtime.loadProductV4InteractiveDocumentAssets(check);
          return runner.executeBrowserProductV4Check({ ...check, baseUrl: "https://www.zyxacademy.com", staticFigureAssets, interactiveDocumentAssets });
        }, selectedInput);
      } catch (error) {
        console.log(JSON.stringify({ schema: "zyx-product-v4-local-result.v1", status: "execution_failed", importId: input.importId, runId: input.runId, checksum: input.expectedChecksum, planHash: requested.plan.planHash, attemptId: requested.attemptId }));
        throw error;
      }
      const verified = await service.getProductV4VerificationLocally({ ...selectedInput, planHash: result.plan.planHash });
      assertSource();
      const outputDirectory = path.resolve(outputRoot, input.importId, verified.attemptId);
      await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
      await writeFile(path.join(outputDirectory, "plan.json"), JSON.stringify(verified.plan, null, 2));
      await writeFile(path.join(outputDirectory, "receipt.json"), JSON.stringify(verified.receipt, null, 2));
      const inventory: { file: string; checkId: string; mediaType: string; checksum: string; byteLength: number; pageNumber?: number }[] = [];
      for (const check of verified.receipt?.results ?? []) for (const artifact of check.artifacts) {
        if (!isProductV4LocalArtifactId(artifact.id, verified.attemptId)) throw new Error("PRODUCT_V4_LOCAL_ARTIFACT_ID_INVALID");
        const bytes = await service.readProductVerificationObject(storage, buildProductVerificationKey(verified.plan.planHash, artifact.id));
        if (!bytes || bytes.byteLength !== artifact.byteLength || createHash("sha256").update(bytes).digest("hex") !== artifact.checksum) throw new Error("PRODUCT_V4_VERIFICATION_ARTIFACT_MISSING_OR_CHANGED");
        await writeFile(path.join(outputDirectory, artifact.id), bytes);
        inventory.push({ file: artifact.id, checkId: check.checkId, mediaType: artifact.mediaType, checksum: artifact.checksum, byteLength: artifact.byteLength, ...(artifact.pageNumber === undefined ? {} : { pageNumber: artifact.pageNumber }) });
      }
      const summary = { schema: "zyx-product-v4-local-result.v1", status: verified.evaluation.ready ? "ready" : "not_ready", sourceRevision: input.sourceRevision, importId: input.importId, runId: input.runId, checksum: input.expectedChecksum, planHash: verified.plan.planHash, receiptSignature: verified.receipt?.signature ?? null, attemptId: verified.attemptId, browserProvider: "local_playwright", chromium, requirementCount: verified.plan.requirements.length, ready: verified.evaluation.ready, artifactCount: inventory.length, outputDirectory, planFile: path.join(outputDirectory, "plan.json"), receiptFile: path.join(outputDirectory, "receipt.json"), inventory, next: "Inspect evidence, then use current MCP review and publication tools with explicit semantic decisions." };
      await writeFile(path.join(outputDirectory, "summary.json"), JSON.stringify(summary, null, 2));
      console.log(JSON.stringify(summary));
      if (!verified.evaluation.ready) throw new Error("PRODUCT_V4_LOCAL_VERIFICATION_NOT_READY");
    } finally { await runner.closeProductV4BrowserRunner(); }
  } finally { await unlock(); }
}

export function reportProductV4LocalFailure(error: unknown) {
  console.error(JSON.stringify(productV4LocalFailure(error)));
  process.exitCode = 1;
}

if (import.meta.main) runProductV4LocalVerification().catch(reportProductV4LocalFailure);
