import type { Context } from "hono";
import { computeFunctions } from "@/jobs/compute";

/**
 * Health check handler.
 * Returns minimal operational information without leaking internal memory or architecture details.
 */
export function healthHandler(c: Context) {
  c.header("Cache-Control", "no-store");
  const version =
    process.env.ZYX_COMPUTE_REVISION ||
    (typeof process !== "undefined" && process.env?.DENO_DEPLOYMENT_ID) ||
    (typeof (globalThis as any).Deno !== "undefined" && (globalThis as any).Deno.env.get("DENO_DEPLOYMENT_ID")) ||
    "dev";

  return c.json({
    status: "ok",
    functions: computeFunctions.length,
    version,
  });
}
