import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";
import { WorkerEnvSchema } from "../../workers/deno-background/env.ts";
import { workerTarget, assertWorkerEnvironment } from "./worker-targets.mjs";

const [sourceFile, credentialsFile, targetName] = process.argv.slice(2);
if (!sourceFile || !credentialsFile) throw new Error("Usage: node scripts/neon/deploy-worker.mjs <private-runtime-json> <private-neon-env> <staging|production>");
const target = workerTarget(targetName);
const { project, branch, slug } = target;
const source = JSON.parse(await readFile(sourceFile, "utf8"));
const raw = source.environment;
assertWorkerEnvironment(target, raw);
const credentials = parseEnv(await readFile(credentialsFile, "utf8"));
if (!credentials.NEON_API_KEY) throw new Error("NEON_API_KEY_REQUIRED");
const api = async (path, init = {}) => {
  const response = await fetch(`https://console.neon.tech/api/v2${path}`, { ...init, headers: { Authorization: `Bearer ${credentials.NEON_API_KEY}`, ...init.headers }, signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`NEON_API_FAILED:${response.status}:${path}`);
  return response.json();
};
const actual = await api(`/projects/${project}/branches/${branch}`);
if (actual.branch?.id !== branch || actual.branch?.name !== target.branchName || actual.branch?.protected !== target.protected) throw new Error("COMPUTE_BRANCH_MISMATCH");
const inngestHeaders = { Authorization: `Bearer ${raw.INNGEST_SIGNING_KEY}`, "X-Inngest-Env": raw.INNGEST_ENV };
const identity = await fetch("https://api.inngest.com/v2/envs?limit=250", { headers: inngestHeaders, signal: AbortSignal.timeout(30_000) });
if (!identity.ok) throw new Error(`INNGEST_IDENTITY_FAILED:${identity.status}`);
const environments = await identity.json();
if (environments.data?.length !== 1 || environments.data[0].id !== raw.INNGEST_ENV) throw new Error("COMPUTE_INNGEST_KEY_MISMATCH");
const eventKeysResponse = await fetch("https://api.inngest.com/v2/keys/events?limit=100", { headers: inngestHeaders, signal: AbortSignal.timeout(30_000) });
if (!eventKeysResponse.ok) throw new Error(`INNGEST_EVENT_KEY_IDENTITY_FAILED:${eventKeysResponse.status}`);
const eventKeys = await eventKeysResponse.json();
if (!eventKeys.data?.some(key => key.key === raw.INNGEST_EVENT_KEY)) throw new Error("COMPUTE_INNGEST_EVENT_KEY_MISMATCH");
const previous = await api(`/projects/${project}/branches/${branch}/functions`);
await mkdir(target.output, { recursive: true });
await writeFile(`${target.output}/before.json`, JSON.stringify({ project, branch, functions: previous.functions?.map(fn => ({ slug: fn.slug, invocation_url: fn.invocation_url, deployment: fn.latest_deployment?.id })) ?? [], sourceRevision: source.sourceRevision }, null, 2), { flag: "wx" }).catch(error => { if (error.code !== "EEXIST") throw error; });
const allowed = new Set([...Object.keys(WorkerEnvSchema.shape), "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_ENDPOINT_URL_S3", "AWS_REGION", "NEON_STORAGE_BUCKET", "STORAGE_PROVIDER_MODE", "INNGEST_ENV", "CF_BROWSER_API_TOKEN", "AUTHORING_VERIFICATION_ACCESS_URL", "ZYX_ENVIRONMENT", "ZYX_MCP_ENVIRONMENT"]);
const environment = Object.fromEntries(Object.entries(raw).filter(([name]) => allowed.has(name) || name.startsWith("FEATURE_") || name === "VECTOR_SYNC_BATCH_SIZE"));
environment.ZYX_COMPUTE_RUNTIME = "neon";
environment.ZYX_COMPUTE_BUILD_RUNTIME = await readFile("artifacts/authoring-verification/web-runtime.json", "utf8");
environment.AUTHORING_VERIFICATION_BROWSER_PROVIDER = "cloudflare";
// No scheduler is registered until the returned URL is independently read back and tested.
environment.INNGEST_SERVE_ORIGIN = target.origin;
environment.INNGEST_SERVE_PATH = "/api/inngest";
environment.ZYX_COMPUTE_REVISION = createHash("sha256").update(await readFile("artifacts/neon-worker/worker.zip")).digest("hex");
for (const name of ["INNGEST_SIGNING_KEY", "COMPUTE_SERVICE_SECRET", "DIKTAT_RENDERER_SECRET", "AWS_SECRET_ACCESS_KEY"]) if (!environment[name]) throw new Error(`COMPUTE_ENV_REQUIRED:${name}`);
await writeFile(`${target.output}/.env.${target.name}.json`, JSON.stringify(environment));
const form = new FormData();
form.set("zip", new Blob([await readFile("artifacts/neon-worker/worker.zip")], { type: "application/zip" }), "worker.zip");
form.set("environment", JSON.stringify(environment));
form.set("runtime", "nodejs24");
await api(`/projects/${project}/branches/${branch}/functions/${slug}/deployments`, { method: "POST", body: form });
console.log(JSON.stringify({ deploymentRequested: true, project, branch, slug, archiveChecksum: environment.ZYX_COMPUTE_REVISION }));
for (let attempt = 0; attempt < 90; attempt++) {
  const result = await api(`/projects/${project}/branches/${branch}/functions/${slug}`);
  const current = result.function ?? result;
  if (current.current_deployment?.status === "failed") throw new Error("NEON_DEPLOYMENT_FAILED");
  if (current.current_deployment?.status === "completed" && current.active_deployment?.id === current.current_deployment.id) {
    if (new URL(current.invocation_url).origin !== environment.INNGEST_SERVE_ORIGIN) throw new Error("NEON_INVOCATION_URL_MISMATCH");
    const response = await fetch(`${environment.INNGEST_SERVE_ORIGIN}/health`, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`NEON_HEALTH_FAILED:${response.status}:${(await response.text()).slice(0, 300)}`);
    const health = await response.json();
    if (health.version === environment.ZYX_COMPUTE_REVISION && health.functions === 22) {
      const after = { project, branch, slug, deploymentId: current.active_deployment.id, url: current.invocation_url, checksum: health.version, functions: health.functions };
      await writeFile(`${target.output}/after.json`, JSON.stringify(after, null, 2));
      console.log(JSON.stringify({ ready: true, ...after }));
      process.exit(0);
    }
  }
  await new Promise(resolve => setTimeout(resolve, 2000));
}
throw new Error("NEON_DEPLOYMENT_READINESS_TIMEOUT");
