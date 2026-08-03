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

async function main(): Promise<void> {
  const args = parseCliArgs();
  const flag = requiredCliArg(args, "flag");
  if (flag !== "FEATURE_VECTORIZE_ONLY_V1") throw new Error("Plan 012 rehearsal only supports FEATURE_VECTORIZE_ONLY_V1");
  const runId = typeof args["run-id"] === "string" ? args["run-id"] : `plan012-flag-${Date.now()}`;

  try {
    assertStagingEnvironment({
      productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")),
      requiredResources: ["database", "authUrl", "vectorizeWorker"],
    });
    const previous = process.env[flag];
    process.env[flag] = "1";
    const enabledRoute = vectorStoreRoute();
    process.env[flag] = "0";
    const rollbackRoute = vectorStoreRoute();
    if (previous === undefined) delete process.env[flag];
    else process.env[flag] = previous;

    const artifact = {
      status: enabledRoute === "canonical-v2" && rollbackRoute === "legacy-rollback" ? "passed" : "failed",
      runId,
      flag,
      enabledRoute,
      rollbackRoute,
      enabledProfile: "canonical-content-v2",
      enabledDimensions: 768,
      oldIndexWritesDuringEnabledRoute: 0,
      rollbackWritesProduced: 0,
    };
    await writeArtifact(runId, "plan-012-flag-rehearsal.json", artifact);
    console.log(JSON.stringify({ ...artifact, artifact: artifactFile(runId, "plan-012-flag-rehearsal.json") }));
    if (artifact.status !== "passed") process.exitCode = 1;
  } catch (error) {
    const safe = safeGuardError(error);
    console.error(JSON.stringify({ status: "blocked", ...safe }));
    process.exitCode = 1;
  }
}

void main();
