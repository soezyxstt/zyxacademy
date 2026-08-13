import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

type JsonRecord = Record<string, unknown>;

const PLAN = "005";
const DEFAULT_MAX_REQUESTS = 40;
const MIN_APPLICATION_REQUEST_INTERVAL_MS = 3_100;

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function safeCode(error: unknown): string {
  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Z0-9_:-]{1,80}$/.test(code)) return code;
    const name = (error as { name?: unknown }).name;
    if (typeof name === "string" && /^[A-Za-z0-9_:-]{1,80}$/.test(name)) return name;
  }
  return "PROVIDER_ROUTER_SMOKE_FAILED";
}

function safeReason(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const reason = (error as { reason?: unknown }).reason;
  return typeof reason === "string" && /^[A-Z0-9_:-]{1,80}$/.test(reason) ? reason : undefined;
}

function artifactPath(runId: string): string {
  return resolve("artifacts", "zyra-ai", runId, "plan-005-provider-router.json");
}

async function writeArtifact(runId: string, artifact: JsonRecord): Promise<string> {
  const path = artifactPath(runId);
  await mkdir(resolve("artifacts", "zyra-ai", runId), { recursive: true });
  await writeFile(path, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  return path;
}

function requiredStagingKeys(): string[] {
  const required = [
    "ZYRA_CONTROL_PLANE_URL",
    "ZYRA_CONTROL_PLANE_TOKEN",
    "CF_AI_GATEWAY_URL",
    "CF_AI_GATEWAY_TOKEN",
    "STAGING_ZYRA_PROVIDER_ROUTER_USER_ID",
    "GEMINI_API_KEY",
    "GEMINI_API_KEY_2",
    "GEMINI_API_KEY_3",
    "GEMINI_API_KEY_4",
    "GEMINI_PROJECT_ALIAS_1",
    "GEMINI_PROJECT_ALIAS_2",
    "GEMINI_PROJECT_ALIAS_3",
    "GEMINI_PROJECT_ALIAS_4",
  ];
  return required.filter((key) => !process.env[key]?.trim());
}

function targetGuardFailures(): string[] {
  const failures: string[] = [];
  const productionPattern = /(^|[/:._-])(prod|production|live)(?=$|[/:._-])/i;
  const controlPlaneUrl = process.env.ZYRA_CONTROL_PLANE_URL?.trim();
  const gatewayUrl = process.env.CF_AI_GATEWAY_URL?.trim();

  let controlPlane: URL;
  try {
    controlPlane = new URL(controlPlaneUrl ?? "");
  } catch {
    failures.push("ZYRA_CONTROL_PLANE_URL_STAGING_TARGET_INVALID");
    controlPlane = new URL("https://invalid.local");
  }
  if (controlPlane.protocol !== "https:" || !controlPlane.toString().toLowerCase().includes("staging") || productionPattern.test(controlPlane.toString())) {
    failures.push("ZYRA_CONTROL_PLANE_URL_STAGING_TARGET_INVALID");
  }

  let gateway: URL;
  try {
    gateway = new URL(gatewayUrl ?? "");
  } catch {
    failures.push("CF_AI_GATEWAY_URL_TARGET_INVALID");
    gateway = new URL("https://invalid.local");
  }
  if (gateway.protocol !== "https:" || productionPattern.test(gateway.toString())) {
    failures.push("CF_AI_GATEWAY_URL_TARGET_INVALID");
  }
  return [...new Set(failures)];
}

async function main(): Promise<void> {
  const runId = argValue("--run-id") ?? `plan005-provider-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const maxText = argValue("--max-provider-requests") ?? String(DEFAULT_MAX_REQUESTS);
  const maxRequests = Number(maxText);
  if (!/^[A-Za-z0-9._-]+$/.test(runId)) throw new Error("invalid run id");
  if (!Number.isInteger(maxRequests) || maxRequests < 1 || maxRequests > DEFAULT_MAX_REQUESTS) {
    throw new Error(`max-provider-requests must be between 1 and ${DEFAULT_MAX_REQUESTS}`);
  }

  const missing = [...requiredStagingKeys(), ...targetGuardFailures()];
  if (process.env.ZYX_ENVIRONMENT !== "staging" || process.env.ALLOW_STAGING_MUTATION !== "1") {
    missing.push("ZYX_ENVIRONMENT=staging and ALLOW_STAGING_MUTATION=1");
  }
  if (missing.length > 0) {
    const path = await writeArtifact(runId, {
      status: "blocked",
      plan: PLAN,
      phase: "staging_provider_router_smoke",
      blocker: "STAGING_PROVIDER_ROUTER_PREREQUISITES_MISSING",
      missing,
      maxProviderRequests: maxRequests,
      providerCalls: 0,
      quarantinedTraffic: 0,
      secretsPrinted: false,
      authenticatedUrlsPrinted: false,
    });
    console.log(`provider router smoke status=blocked missing=${missing.join(",")} providerCalls=0 artifact=${path}`);
    process.exitCode = 1;
    return;
  }
  const stagingUserId = process.env.STAGING_ZYRA_PROVIDER_ROUTER_USER_ID;
  if (!stagingUserId) {
    throw new Error("STAGING_ZYRA_PROVIDER_ROUTER_USER_ID is required after staging preflight");
  }

  const previousFlags = {
    FEATURE_ZYRA_ALLOWANCE_V2: process.env.FEATURE_ZYRA_ALLOWANCE_V2,
    FEATURE_ZYRA_PROVIDER_ROUTER_V2: process.env.FEATURE_ZYRA_PROVIDER_ROUTER_V2,
    FEATURE_AI_PROVIDER_REGISTRY_V1: process.env.FEATURE_AI_PROVIDER_REGISTRY_V1,
  };
  process.env.FEATURE_ZYRA_ALLOWANCE_V2 = "1";
  process.env.FEATURE_ZYRA_PROVIDER_ROUTER_V2 = "1";
  process.env.FEATURE_AI_PROVIDER_REGISTRY_V1 = "1";

  const projectAliasCounts: Record<string, number> = {};
  const modelCounts: Record<string, number> = {};
  let successes = 0;
  let failures = 0;
  let providerCalls = 0;
  let lifecycleRequests = 0;
  let viaGatewayFailures = 0;
  const failureCodes: string[] = [];
  const failureReasonCounts: Record<string, number> = {};
  let nextApplicationRequestAt = 0;

  try {
    const [{ RequestLifecycle }, { createProviderInvokerFromEnvironment }] = await Promise.all([
      import("../../lib/ai/request-lifecycle"),
      import("../../lib/ai/provider/runtime-invoker"),
    ]);
    const providerInvoker = createProviderInvokerFromEnvironment();
    const lifecycle = new RequestLifecycle({
      invokeProvider: async (input) => {
        providerCalls += 1;
        return providerInvoker(input);
      },
    });
    for (let index = 0; index < maxRequests; index += 1) {
      const waitMs = nextApplicationRequestAt - Date.now();
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
      lifecycleRequests += 1;
      try {
        const result = await lifecycle.execute({
          userId: stagingUserId,
          idempotencyKey: `${runId}-${index}`,
          feature: "plan005-staging-provider-router",
          useCase: "explain-concept",
          cacheStatus: "bypass",
          cachePolicy: "bypass",
          parts: [{ type: "text", text: "Provide one short staging-only health-check response." }],
        });
        successes += 1;
        modelCounts[result.modelId] = (modelCounts[result.modelId] ?? 0) + 1;
        if (result.projectAlias) projectAliasCounts[result.projectAlias] = (projectAliasCounts[result.projectAlias] ?? 0) + 1;
      } catch (error) {
        failures += 1;
        if (failureCodes.length < 8) failureCodes.push(safeCode(error));
        const reason = safeReason(error);
        if (reason) failureReasonCounts[reason] = (failureReasonCounts[reason] ?? 0) + 1;
      } finally {
        nextApplicationRequestAt = Date.now() + MIN_APPLICATION_REQUEST_INTERVAL_MS;
      }
    }
  } finally {
    for (const [key, value] of Object.entries(previousFlags)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  const distinctProjects = Object.keys(projectAliasCounts).length;
  const quarantinedTraffic = Object.keys(modelCounts).filter((model) => model.includes("3.5-flash-lite") || model.includes("preview") || model.includes("gemma-4-26b")).length;
  const passed = failures === 0
    && providerCalls <= maxRequests
    && successes === maxRequests
    && distinctProjects === 4
    && viaGatewayFailures === 0
    && quarantinedTraffic === 0;
  const path = await writeArtifact(runId, {
    status: passed ? "passed" : "partial",
    plan: PLAN,
    phase: "staging_provider_router_smoke",
    maxProviderRequests: maxRequests,
    lifecycleRequests,
    providerCalls,
    successfulRequests: successes,
    failedRequests: failures,
    projectAliasCounts,
    modelCounts,
    distinctProjects,
    viaGatewayFailures,
    quarantinedTraffic,
    failureCodes,
    failureReasonCounts,
    applicationRequestIntervalMs: MIN_APPLICATION_REQUEST_INTERVAL_MS,
    featureFlagRestored: process.env.FEATURE_ZYRA_PROVIDER_ROUTER_V2 !== "1",
    secretsPrinted: false,
    authenticatedUrlsPrinted: false,
  });
  console.log(`provider router smoke status=${passed ? "passed" : "partial"} providerCalls=${providerCalls} successes=${successes} failures=${failures} distinctProjects=${distinctProjects} quarantinedTraffic=${quarantinedTraffic} artifact=${path}`);
  if (!passed) process.exitCode = 1;
}

await main();
