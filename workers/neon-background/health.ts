import type { Context } from "hono";
import { computeFunctions } from "@/jobs/compute";

/**
 * Health check handler.
 * Returns minimal operational information without leaking internal memory or architecture details.
 */
export function healthHandler(c: Context) {
  c.header("Cache-Control", "no-store");
  const version = process.env.ZYX_COMPUTE_REVISION || "dev";

  return c.json({
    status: "ok",
    functions: computeFunctions.length,
    version,
  });
}
