import { assertTarget } from "../neon/import-core";
import { workerTarget } from "../neon/worker-targets.mjs";

type OperationEnvironment = Readonly<Record<string, string | undefined>>;

/** Validate the selected environment before loading database or storage clients. */
export function assertV4OperationTarget(env: OperationEnvironment) {
  const environment = env.ZYX_ENVIRONMENT;
  if (environment !== "staging" && environment !== "production") {
    throw new Error("V4_OPERATION_ENVIRONMENT_INVALID");
  }
  const target = workerTarget(environment);
  if (env.NEXT_PUBLIC_APP_URL !== target.appOrigin) {
    throw new Error("V4_OPERATION_ENVIRONMENT_INVALID");
  }

  try {
    // Use the same variable as the application adapter, with no legacy fallback.
    const databaseUrl = (env.DATABASE_URL ?? "").replace(/^postgres:/i, "postgresql:");
    assertTarget(databaseUrl, target.databaseHost, "neondb");
  } catch {
    throw new Error("V4_OPERATION_DATABASE_TARGET_MISMATCH");
  }

  const storageOrigin = `https://${target.branch}.storage.c-3.ap-southeast-1.aws.neon.tech`;
  try {
    const endpoint = new URL(env.AWS_ENDPOINT_URL_S3 ?? "");
    if (env.STORAGE_PROVIDER_MODE !== "neon" || env.AWS_REGION !== "ap-southeast-1" ||
        env.NEON_STORAGE_BUCKET !== target.bucket || endpoint.origin !== storageOrigin ||
        endpoint.username || endpoint.password || endpoint.pathname !== "/" || endpoint.search || endpoint.hash) {
      throw new Error("V4_OPERATION_STORAGE_TARGET_MISMATCH");
    }
  } catch {
    throw new Error("V4_OPERATION_STORAGE_TARGET_MISMATCH");
  }
  if ([env.AWS_ACCESS_KEY_ID, env.AWS_SECRET_ACCESS_KEY].some(value => !value?.trim() || value.trim() === "[SENSITIVE]")) {
    throw new Error("V4_OPERATION_STORAGE_CREDENTIALS_REQUIRED");
  }

  // Only public target identity is safe to log; never return connection strings.
  return { environment, origin: target.appOrigin, databaseHost: target.databaseHost };
}
