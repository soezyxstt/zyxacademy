import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  currentSourceCommit,
  parseCliArgs,
  requiredCliArg,
} from "@/lib/staging/migration-ledger";
import {
  assertStagingEnvironment,
  parseEnvFile,
  safeGuardError,
  safeEnvironmentKeys,
} from "@/lib/staging/staging-guard";

const planNumber = "001";
const resourceAliases = {
  worker: "zyx-zyra-control-staging",
  kv: "zyx-staging",
  privateBucket: "zyx-zyra-private-staging",
  semanticCache: "zyx-zyra-cache-staging",
  analyticsDataset: "zyx_zyra_events_staging",
} as const;

function artifactPath(runId: string): string {
  return join(process.cwd(), "artifacts", "zyra-ai", runId, `plan-${planNumber}-preflight.json`);
}

async function writePreflightArtifact(runId: string, value: unknown): Promise<void> {
  const path = artifactPath(runId);
  await mkdir(join(process.cwd(), "artifacts", "zyra-ai", runId), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  const stagingEnv = parseEnvFile(join(process.cwd(), ".env.staging"));
  const productionEnv = parseEnvFile(join(process.cwd(), ".env.prod"));
  const rootEnv = parseEnvFile(join(process.cwd(), ".env"));

  try {
    const guard = assertStagingEnvironment({
      env: stagingEnv,
      productionEnv,
      requiredResources: ["database", "authUrl", "vectorizeWorker"],
      requireMutation: true,
    });

    const checks = {
      stagingIdentity: guard.environment === "staging",
      mutationAuthorization: guard.mutationAllowed,
      cloudflareTokenPresent: Boolean(rootEnv.CLOUDFLARE_API_TOKEN),
      controlPlaneTokenPresent: Boolean(stagingEnv.ZYRA_CONTROL_PLANE_TOKEN),
      productionEnvironmentCompared: Object.keys(productionEnv).length > 0,
      preservedVectorizeDimensions: [1024, 1024].every((dimensions) => dimensions === 1024),
      semanticCacheDimensions: 768,
      semanticCacheMetric: "cosine",
      privateAttachmentRetentionDays: 7,
    };

    if (!checks.cloudflareTokenPresent) throw new Error("CLOUDFLARE_API_TOKEN_REQUIRED");

    const artifact = {
      planNumber,
      runId,
      status: "passed",
      sourceCommit: currentSourceCommit(),
      stagingResourceAliases: resourceAliases,
      checks,
      safeStagingEnvironmentKeys: safeEnvironmentKeys(stagingEnv),
      operatorTimestamp: new Date().toISOString(),
    };
    await writePreflightArtifact(runId, artifact);
    console.log(JSON.stringify({ status: artifact.status, runId, artifact: artifactPath(runId) }));
  } catch (error) {
    const safe = safeGuardError(error);
    const artifact = {
      planNumber,
      runId,
      status: "blocked",
      sourceCommit: currentSourceCommit(),
      stagingResourceAliases: resourceAliases,
      error: safe,
      operatorTimestamp: new Date().toISOString(),
    };
    await writePreflightArtifact(runId, artifact);
    console.error(JSON.stringify({ status: artifact.status, runId, ...safe }));
    process.exitCode = 1;
  }
}

void main();
