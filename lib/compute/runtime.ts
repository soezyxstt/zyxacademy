/** Shared by the hosted compute adapters; web and local renderer processes stay separate. */
export function isHostedComputeRuntime(): boolean {
  return process.env.ZYX_COMPUTE_RUNTIME === "neon";
}
