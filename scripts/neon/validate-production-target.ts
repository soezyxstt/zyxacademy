import { assertTarget } from "./import-core";
import { validateTarget } from "./copy-storage";

export function validateProductionTarget(env: Record<string, string | undefined>) {
  assertTarget(env.DATABASE_URL || "", "ep-icy-art-az6oa108-pooler.c-3.ap-southeast-1.aws.neon.tech", "neondb");
  if (env.STORAGE_PROVIDER_MODE !== "neon" || env.AWS_REGION !== "ap-southeast-1" || env.NEON_STORAGE_BUCKET !== "zyx-production") throw new Error("PRODUCTION_STORAGE_TARGET_MISMATCH");
  if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) throw new Error("PRODUCTION_STORAGE_CREDENTIALS_REQUIRED");
  validateTarget(env.AWS_ENDPOINT_URL_S3 || "", env.NEON_STORAGE_BUCKET);
}

if (import.meta.main) {
  try { validateProductionTarget(process.env); console.log("Production Neon database and storage targets verified"); }
  catch { console.error("Production Neon target verification failed; no deployment authorized"); process.exitCode = 1; }
}
