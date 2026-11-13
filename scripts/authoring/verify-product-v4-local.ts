import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { assertProductV4LocalTarget, assertProductV4LocalDraft } from "../../lib/compute/product-v4-local-operator";

const outputRoot = "artifacts/v4-local-evidence";
const chromiumVersion = "151.0.7922.34";

export function assertProductV4LocalSource(expected: string, source: { head: string; status: string; origin: string }) {
  if (!/^[a-f0-9]{40}$/.test(expected) || source.head.trim() !== expected || source.status.trim() || !/^(?:https:\/\/github\.com\/|git@github\.com:)soezyxstt\/zyxacademy(?:\.git)?$/.test(source.origin.trim())) throw new Error("PRODUCT_V4_LOCAL_SOURCE_REQUIRED");
}

export function productV4LocalInput(args: string[]) {
  const names = ["--private-env", "--source-sha", "--import-id", "--run-id", "--checksum"];
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    if (!names.includes(args[i]) || values.has(args[i]) || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error("PRODUCT_V4_LOCAL_EXACT_INPUT_REQUIRED");
    values.set(args[i], args[i + 1]);
  }
  const input = { privateFile: values.get("--private-env") ?? "", sourceRevision: values.get("--source-sha") ?? "", importId: values.get("--import-id") ?? "", runId: values.get("--run-id") ?? "", expectedChecksum: values.get("--checksum") ?? "" };
  if (!input.privateFile || !/^[a-f0-9]{40}$/.test(input.sourceRevision) || !/^impor-product-[a-f0-9]{32}$/.test(input.importId) || !/^mcp-run-[a-f0-9-]{36}$/.test(input.runId) || !/^[a-f0-9]{64}$/.test(input.expectedChecksum)) throw new Error("PRODUCT_V4_LOCAL_EXACT_INPUT_REQUIRED");
  return input;
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

export async function runProductV4LocalVerification() {
  const input = productV4LocalInput(process.argv.slice(2));
  const git = (...args: string[]) => execFileSync("git", ["-c", "core.fsmonitor=false", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const assertSource = () => assertProductV4LocalSource(input.sourceRevision, { head: git("rev-parse", "HEAD"), status: git("status", "--porcelain", "--untracked-files=normal"), origin: git("remote", "get-url", "origin") });
  assertSource();
  const root = path.resolve(git("rev-parse", "--show-toplevel"));
  const privateFile = path.resolve(input.privateFile);
  const relative = path.relative(root, privateFile);
  if (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
    try { git("check-ignore", "--quiet", "--", relative); } catch { throw new Error("PRODUCT_V4_LOCAL_PRIVATE_FILE_MUST_BE_IGNORED"); }
  }
  Object.assign(process.env, loadProductV4LocalSettings(JSON.parse(await readFile(privateFile, "utf8")), input.sourceRevision));
  assertProductV4LocalTarget(process.env);

  // Environment-sensitive application modules are loaded only after the private settings.
  const [service, executor, runner, runtime, { storage }, { buildProductVerificationKey }, { getProductBundleImport }] = await Promise.all([
    import("../../lib/bundle/product-v4-verification-service"), import("../../lib/compute/product-v4-verification-executor"),
    import("../../lib/compute/product-v4-browser-runner"), import("../../lib/compute/product-v4-runtime-binding"),
    import("../../lib/storage"), import("../../lib/storage/keys"), import("../../lib/bundle/product-staging"),
  ]);
  try {
    if (runtime.expectedChromiumRuntime().browserVersion !== chromiumVersion) throw new Error("PRODUCT_V4_LOCAL_CHROMIUM_PIN_MISMATCH");
    // Read the explicitly selected production draft before the request may persist an attempt.
    const row = await getProductBundleImport(input.importId);
    assertProductV4LocalDraft(row, input);
    assertSource();
    const selectedInput = { importId: input.importId, runId: input.runId, expectedChecksum: input.expectedChecksum };
    const requested = await service.requestProductV4VerificationLocally(selectedInput);
    const result = await service.processProductV4VerificationJob({ importId: input.importId, runId: input.runId, planHash: requested.plan.planHash, attemptId: requested.attemptId }, undefined, async check => {
      assertSource();
      if (check.requirement.layer === "structure" || check.requirement.layer === "model") return executor.executeProductV4VerificationCheck(check);
      const staticFigureAssets = await runtime.loadProductV4StaticFigureAssets(check.bundle, undefined, check.requirement.layer === "print");
      const interactiveDocumentAssets = await runtime.loadProductV4InteractiveDocumentAssets(check);
      return runner.executeBrowserProductV4Check({ ...check, baseUrl: "https://www.zyxacademy.com", staticFigureAssets, interactiveDocumentAssets });
    });
    const verified = await service.getProductV4Verification({ importId: input.importId, runId: input.runId, planHash: result.plan.planHash });
    assertSource();
    const outputDirectory = path.join(outputRoot, input.importId, verified.attemptId);
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(path.join(outputDirectory, "plan.json"), JSON.stringify(verified.plan, null, 2));
    await writeFile(path.join(outputDirectory, "receipt.json"), JSON.stringify(verified.receipt, null, 2));
    const inventory: { file: string; checksum: string; byteLength: number }[] = [];
    for (const check of verified.receipt?.results ?? []) for (const artifact of check.artifacts) {
      if (!new RegExp(`^artifact-${verified.attemptId}-[a-f0-9]{64}-[0-9]+\\.(png|pdf|json)$`).test(artifact.id)) throw new Error("PRODUCT_V4_LOCAL_ARTIFACT_ID_INVALID");
      const bytes = await service.readProductVerificationObject(storage, buildProductVerificationKey(verified.plan.planHash, artifact.id));
      if (!bytes || bytes.byteLength !== artifact.byteLength || createHash("sha256").update(bytes).digest("hex") !== artifact.checksum) throw new Error("PRODUCT_V4_VERIFICATION_ARTIFACT_MISSING_OR_CHANGED");
      await writeFile(path.join(outputDirectory, artifact.id), bytes);
      inventory.push({ file: artifact.id, checksum: artifact.checksum, byteLength: artifact.byteLength });
    }
    await writeFile(path.join(outputDirectory, "summary.json"), JSON.stringify({ sourceRevision: input.sourceRevision, importId: input.importId, checksum: input.expectedChecksum, planHash: verified.plan.planHash, attemptId: verified.attemptId, browserProvider: "local_playwright", browserVersion: chromiumVersion, requirementCount: verified.plan.requirements.length, ready: verified.evaluation.ready, artifactCount: inventory.length, inventory, publication: "Not performed; exact-revision review and Admin UI publication remain separate." }, null, 2));
    if (!verified.evaluation.ready) throw new Error("PRODUCT_V4_LOCAL_VERIFICATION_NOT_READY");
    console.log(JSON.stringify({ status: "ready", requirementCount: verified.plan.requirements.length, artifactCount: inventory.length }));
  } finally { await runner.closeProductV4BrowserRunner(); }
}

export function reportProductV4LocalFailure(error: unknown) {
  const code = error instanceof Error && /^(?:PRODUCT_V4_|VERIFICATION_)[A-Z0-9_]+$/.test(error.message) ? error.message : "PRODUCT_V4_LOCAL_EXECUTION_FAILED";
  console.error(code);
  process.exitCode = 1;
}

if (import.meta.main) runProductV4LocalVerification().catch(reportProductV4LocalFailure);
