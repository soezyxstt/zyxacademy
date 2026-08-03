import { join } from "node:path";
import {
  assertStagingEnvironment,
  parseEnvFile,
  safeGuardError,
  safeEnvironmentKeys,
} from "@/lib/staging/staging-guard";

function main(): void {
  try {
    const result = assertStagingEnvironment({
      productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")),
      requiredResources: ["database", "authUrl"],
    });

    console.log(
      JSON.stringify({
        status: "ok",
        environment: result.environment,
        mutationAllowed: result.mutationAllowed,
        resources: result.resources,
        safeEnvironmentKeys: safeEnvironmentKeys(process.env),
      }),
    );
  } catch (error) {
    const safe = safeGuardError(error);
    console.error(JSON.stringify({ status: "blocked", ...safe }));
    process.exitCode = 1;
  }
}

main();
