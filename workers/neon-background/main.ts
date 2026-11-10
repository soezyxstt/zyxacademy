import { attachDatabasePool } from "@neon/functions";

const startupAt = performance.now(), startupCpu = process.cpuUsage();
Object.assign(process.env, { ZYX_COMPUTE_RUNTIME: "neon" });
for (const name of ["INNGEST_SIGNING_KEY", "COMPUTE_SERVICE_SECRET", "INNGEST_SERVE_ORIGIN", "ZYX_COMPUTE_BUILD_RUNTIME"]) {
  if (!process.env[name]) throw new Error(`NEON_COMPUTE_ENV_REQUIRED:${name}`);
}
const origin = new URL(process.env.INNGEST_SERVE_ORIGIN!);
if (origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") throw new Error("NEON_COMPUTE_ORIGIN_INVALID");

const [{ default: app }, { pool }] = await Promise.all([import("../deno-background/main"), import("../../lib/db")]);
attachDatabasePool(pool);
const startupUsed = process.cpuUsage(startupCpu);
console.info(JSON.stringify({ event: "compute.startup", cwd: process.cwd(), durationMs: Math.round(performance.now() - startupAt), processCpuMs: Math.round((startupUsed.user + startupUsed.system) / 1000) }));

const worker = {
  async fetch(request: Request): Promise<Response> {
    const started = performance.now(), cpu = process.cpuUsage();
    const response = await app.fetch(request);
    const used = process.cpuUsage(cpu);
    // Process CPU overlaps concurrent requests; retain it as a diagnostic, not billable job accounting.
    console.info(JSON.stringify({ event: "compute.request", path: new URL(request.url).pathname, method: request.method, status: response.status,
      durationMs: Math.round(performance.now() - started), processCpuMs: Math.round((used.user + used.system) / 1000) }));
    return response;
  },
};
export default worker;
