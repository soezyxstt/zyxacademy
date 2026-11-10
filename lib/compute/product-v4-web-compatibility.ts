import manifest from "./product-v4-web-compatibility.json";
import type { ProductV4RuntimeFingerprint } from "./product-v4-runtime-binding";

/** Temporary production bridge, remove after a coordinated web/worker release. */
type Scope = { importId: string; bundleId: string; courseId: string; sourceFigureCount: number };
export function productV4TargetRuntime(actual: ProductV4RuntimeFingerprint, scope?: Scope, env = process.env): ProductV4RuntimeFingerprint {
  if (env.ZYX_COMPUTE_RUNTIME !== "neon" || env.NEXT_PUBLIC_APP_URL !== manifest.origin) return actual;
  if (!scope || scope.importId !== manifest.scope.importId || scope.bundleId !== manifest.scope.bundleId || scope.courseId !== manifest.scope.courseId) return actual;
  if (scope.sourceFigureCount) throw new Error("PRODUCT_V4_COMPATIBILITY_SOURCE_FIGURE_UNSUPPORTED");
  for (const key of ["fontChecksum", "playbookChecksum", "printProfile"] as const) {
    if (actual[key] !== manifest.webRuntime[key]) throw new Error(`PRODUCT_V4_COMPATIBILITY_MISMATCH:${key}`);
  }
  if (env.AUTHORING_VERIFICATION_BROWSER_PROVIDER !== "cloudflare") throw new Error("PRODUCT_V4_COMPATIBILITY_BROWSER_MISMATCH");
  return { ...manifest.webRuntime };
}

export function productV4CompatibilityEvidence(actual: ProductV4RuntimeFingerprint, scope?: Scope, env = process.env) {
  const target = productV4TargetRuntime(actual, scope, env);
  return target === actual ? null : { schemaVersion: "product-v4-runtime-compatibility.v1", targetWeb: manifest,
    executor: { runtime: actual, archiveChecksum: env.ZYX_COMPUTE_REVISION, runtimeHost: "neon" },
    semantics: "The plan identifies the deployed web renderer. The independently embedded executor identity identifies the worker performing checks." };
}
