/** Shared by the hosted compute adapters; web and local renderer processes stay separate. */
export function isHostedComputeRuntime(): boolean {
  return typeof (globalThis as { Deno?: unknown }).Deno !== "undefined" || process.env.ZYX_COMPUTE_RUNTIME === "neon";
}
