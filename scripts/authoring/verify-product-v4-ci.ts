import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateProductionTarget } from "../neon/validate-production-target";

const outputDirectory = "artifacts/v4-ci-evidence";
const chromiumVersion = "151.0.7922.34";

export function assertProductV4CiContext(env: Record<string, string | undefined>) {
  if (env.GITHUB_ACTIONS !== "true" || env.GITHUB_REPOSITORY !== "soezyxstt/zyxacademy" || env.GITHUB_REF !== "refs/heads/main" || env.GITHUB_EVENT_NAME !== "workflow_dispatch" || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? "")) throw new Error("PRODUCT_V4_CI_CONTEXT_REQUIRED");
}

export function assertProductV4CiTarget(env: Record<string, string | undefined>) {
  assertProductV4CiContext(env);
  validateProductionTarget(env);
  if (env.ZYX_ENVIRONMENT !== "production" || env.ZYX_MCP_ENVIRONMENT !== "production" || env.NEXT_PUBLIC_APP_URL !== "https://www.zyxacademy.com" || env.BETTER_AUTH_URL !== "https://www.zyxacademy.com" || env.NODE_ENV !== "production" || env.AUTHORING_VERIFICATION_BROWSER_PROVIDER !== "github_actions" || env.ZYX_COMPUTE_RUNTIME || env.ZYX_COMPUTE_BUILD_RUNTIME || env.NEXT_PUBLIC_V4_WEB_RUNTIME) throw new Error("PRODUCT_V4_CI_TARGET_REQUIRED");
}

export function productV4CiInput(env: Record<string, string | undefined>) {
  const input = { importId: env.V4_IMPORT_ID ?? "", runId: env.V4_RUN_ID ?? "", expectedChecksum: env.V4_EXPECTED_CHECKSUM ?? "" };
  if (!/^impor-product-[a-f0-9]{32}$/.test(input.importId) || !/^mcp-run-[a-f0-9-]{36}$/.test(input.runId) || !/^[a-f0-9]{64}$/.test(input.expectedChecksum)) throw new Error("PRODUCT_V4_CI_EXACT_INPUT_REQUIRED");
  return input;
}

async function main() {
  assertProductV4CiContext(process.env);
  const input = productV4CiInput(process.env);
  const privateFile = process.argv[2];
  if (!privateFile) throw new Error("PRODUCT_V4_CI_PRIVATE_SETTINGS_REQUIRED");
  const settings = JSON.parse(await readFile(privateFile, "utf8"));
  if (settings.sourceRevision !== process.env.GITHUB_SHA || !settings.environment || typeof settings.environment !== "object" || Array.isArray(settings.environment)) throw new Error("PRODUCT_V4_CI_SETTINGS_INVALID");
  for (const [key, value] of Object.entries(settings.environment)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key) || key.startsWith("GITHUB_") || typeof value !== "string") throw new Error("PRODUCT_V4_CI_SETTINGS_INVALID");
    process.env[key] = value;
  }
  process.env.AUTHORING_VERIFICATION_BROWSER_PROVIDER = "github_actions";
  process.env.NODE_ENV = "production";
  assertProductV4CiTarget(process.env);

  // Environment-sensitive application modules are loaded only after the private settings.
  const [service, executor, runner, runtime, { storage }, { buildProductVerificationKey }, { getProductBundleImport }] = await Promise.all([
    import("../../lib/bundle/product-v4-verification-service"), import("../../lib/compute/product-v4-verification-executor"),
    import("../../lib/compute/product-v4-browser-runner"), import("../../lib/compute/product-v4-runtime-binding"),
    import("../../lib/storage"), import("../../lib/storage/keys"), import("../../lib/bundle/product-staging"),
  ]);
  try {
    if (runtime.expectedChromiumRuntime().browserVersion !== chromiumVersion) throw new Error("PRODUCT_V4_CI_CHROMIUM_PIN_MISMATCH");
    // Read the explicitly selected production draft before the request may persist an attempt.
    const row = await getProductBundleImport(input.importId);
    const existing = row?.validationReport.productV4Verification as { runId?: unknown } | undefined;
    if (!row || row.bundleType !== "product" || row.status !== "draft" || row.version !== 4 || row.checksum !== input.expectedChecksum || existing?.runId !== input.runId) throw new Error("PRODUCT_V4_CI_EXACT_DRAFT_REQUIRED");
    const requested = await service.requestProductV4VerificationInGithubActions(input);
    const result = await service.processProductV4VerificationJob({ importId: input.importId, runId: input.runId, planHash: requested.plan.planHash, attemptId: requested.attemptId }, undefined, async check => {
      if (check.requirement.layer === "structure" || check.requirement.layer === "model") return executor.executeProductV4VerificationCheck(check);
      const staticFigureAssets = await runtime.loadProductV4StaticFigureAssets(check.bundle);
      return runner.executeBrowserProductV4Check({ ...check, baseUrl: "https://www.zyxacademy.com", staticFigureAssets });
    });
    const verified = await service.getProductV4Verification({ importId: input.importId, runId: input.runId, planHash: result.plan.planHash });
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(path.join(outputDirectory, "plan.json"), JSON.stringify(verified.plan, null, 2));
    await writeFile(path.join(outputDirectory, "receipt.json"), JSON.stringify(verified.receipt, null, 2));
    const inventory: { file: string; checksum: string; byteLength: number }[] = [];
    for (const check of verified.receipt?.results ?? []) for (const artifact of check.artifacts) {
      if (!new RegExp(`^artifact-${verified.attemptId}-[a-f0-9]{64}-[0-9]+\\.(png|pdf|json)$`).test(artifact.id)) throw new Error("PRODUCT_V4_CI_ARTIFACT_ID_INVALID");
      const bytes = await service.readProductVerificationObject(storage, buildProductVerificationKey(verified.plan.planHash, artifact.id));
      if (!bytes || bytes.byteLength !== artifact.byteLength || createHash("sha256").update(bytes).digest("hex") !== artifact.checksum) throw new Error("PRODUCT_V4_VERIFICATION_ARTIFACT_MISSING_OR_CHANGED");
      await writeFile(path.join(outputDirectory, artifact.id), bytes);
      inventory.push({ file: artifact.id, checksum: artifact.checksum, byteLength: artifact.byteLength });
    }
    await writeFile(path.join(outputDirectory, "summary.json"), JSON.stringify({ sourceRevision: process.env.GITHUB_SHA, importId: input.importId, checksum: input.expectedChecksum, planHash: verified.plan.planHash, attemptId: verified.attemptId, browserProvider: "github_actions", browserVersion: chromiumVersion, requirementCount: verified.plan.requirements.length, ready: verified.evaluation.ready, artifactCount: inventory.length, inventory, publication: "Not performed; exact-revision review and Admin UI publication remain separate." }, null, 2));
    if (!verified.evaluation.ready) throw new Error("PRODUCT_V4_CI_VERIFICATION_NOT_READY");
    console.log(JSON.stringify({ status: "ready", requirementCount: verified.plan.requirements.length, artifactCount: inventory.length }));
  } finally { await runner.closeProductV4BrowserRunner(); }
}

if (import.meta.main) main().catch(error => {
  const code = error instanceof Error && /^(?:PRODUCT_V4_|VERIFICATION_)[A-Z0-9_]+$/.test(error.message) ? error.message : "PRODUCT_V4_CI_EXECUTION_FAILED";
  console.error(code);
  process.exitCode = 1;
});
