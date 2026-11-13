import { validateProductionTarget } from "../../scripts/neon/validate-production-target";
import { isHostedComputeRuntime } from "./runtime";

/** Private operator path, never an HTTP endpoint or a hosted compute fallback. */
export function assertProductV4LocalTarget(env: Record<string, string | undefined>, hosted = isHostedComputeRuntime()) {
  if (hosted || env.VERCEL || env.K_SERVICE || env.GITHUB_ACTIONS === "true" || env.ZYX_COMPUTE_RUNTIME || env.ZYX_COMPUTE_BUILD_RUNTIME || env.NEXT_PUBLIC_V4_WEB_RUNTIME || env.NODE_OPTIONS || env.BUN_OPTIONS) throw new Error("PRODUCT_V4_LOCAL_CONTEXT_REQUIRED");
  validateProductionTarget(env);
  if (env.ZYX_ENVIRONMENT !== "production" || env.ZYX_MCP_ENVIRONMENT !== "production" || env.NEXT_PUBLIC_APP_URL !== "https://www.zyxacademy.com" || env.BETTER_AUTH_URL !== "https://www.zyxacademy.com" || env.NODE_ENV !== "production" || env.AUTHORING_VERIFICATION_BROWSER_PROVIDER !== "local_playwright") throw new Error("PRODUCT_V4_LOCAL_TARGET_REQUIRED");
}

export function assertProductV4LocalDraft(row: { bundleType: string; version: number; status: string; checksum: string; validationReport: { productV4Verification?: unknown } } | null | undefined, input: { runId: string; expectedChecksum: string }, staging: { action: string; correlationId: string | null; afterSnapshot: Record<string, unknown> | null } | null | undefined) {
  if (!row || row.bundleType !== "product" || row.version !== 4 || row.status !== "draft" || row.checksum !== input.expectedChecksum || !staging || !["draft_created", "draft_replaced"].includes(staging.action) || staging.correlationId !== input.runId || staging.afterSnapshot?.checksum !== input.expectedChecksum) throw new Error("PRODUCT_V4_LOCAL_EXACT_DRAFT_REQUIRED");
}
