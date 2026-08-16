import { join } from "node:path";
import {
  assertStagingEnvironment,
  parseEnvFile,
  safeGuardError,
} from "@/lib/staging/staging-guard";
import {
  artifactFile,
  parseCliArgs,
  requiredCliArg,
  writeArtifact,
} from "@/lib/staging/migration-ledger";
import { vectorStoreRoute } from "@/lib/vector-store";

/**
 * Compatibility entry point for the legacy command name.
 * Canonical Vectorize is always-on, so this validates one route only.
 */
async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");

  try {
    assertStagingEnvironment({
      productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")),
      requiredResources: ["database", "authUrl", "vectorizeWorker"],
    });
    const route = vectorStoreRoute();
    const artifact = {
      status: route === "canonical-v2" ? "passed" : "failed",
      runId,
      route,
      policy: "canonical-always-on",
      enabledProfile: "canonical-content-v2",
      enabledDimensions: 768,
      legacyIndexWrites: 0,
    };
    await writeArtifact(runId, "plan-012-route-rehearsal.json", artifact);
    console.log(JSON.stringify({ ...artifact, artifact: artifactFile(runId, "plan-012-route-rehearsal.json") }));
    if (artifact.status !== "passed") process.exitCode = 1;
  } catch (error) {
    const safe = safeGuardError(error);
    console.error(JSON.stringify({ status: "blocked", ...safe }));
    process.exitCode = 1;
  }
}

void main();
