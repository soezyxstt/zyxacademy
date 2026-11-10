const project = "muddy-sky-44104897", slug = "zyxcompute";
const profiles = {
  staging: { branch: "br-gentle-scene-azq0gp91", branchName: "staging-neon-cutover-20261102", protected: false,
    databaseHost: "ep-sparkling-lab-azrp3ymj-pooler.c-3.ap-southeast-1.aws.neon.tech", bucket: "zyx-staging", appOrigin: "https://staging.zyxacademy.com",
    inngestEnvironment: "staging-40f1da25", rendererOrigin: "https://zyx-diktat-renderer-staging.16922204.workers.dev", output: "artifacts/neon-worker" },
  production: { branch: "br-wandering-butterfly-azi11h8r", branchName: "production", protected: true,
    databaseHost: "ep-quiet-math-azyey0mb-pooler.c-3.ap-southeast-1.aws.neon.tech", bucket: "zyx-production", appOrigin: "https://www.zyxacademy.com",
    inngestEnvironment: "production-1bedaa8a", rendererOrigin: "https://zyx-diktat-renderer.16922204.workers.dev", output: "artifacts/neon-worker/production" },
};

export function workerTarget(name) {
  if (!Object.hasOwn(profiles, name)) throw new Error("COMPUTE_ENVIRONMENT_REQUIRED");
  const profile = profiles[name];
  return { ...profile, name, project, slug, origin: `https://${profile.branch}-${slug}.compute.c-3.ap-southeast-1.aws.neon.tech` };
}

export function assertWorkerEnvironment(target, env) {
  if (env?.ZYX_ENVIRONMENT !== target.name || env?.ZYX_MCP_ENVIRONMENT !== target.name || env.INNGEST_ENV !== target.inngestEnvironment) throw new Error("COMPUTE_ENVIRONMENT_MISMATCH");
  const database = new URL(env.DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(database.protocol) || database.hostname !== target.databaseHost || database.pathname !== "/neondb" || database.searchParams.get("sslmode") !== "verify-full") throw new Error("COMPUTE_DATABASE_TARGET_MISMATCH");
  const storage = new URL(env.AWS_ENDPOINT_URL_S3);
  if (storage.origin !== `https://${target.branch}.storage.c-3.ap-southeast-1.aws.neon.tech` || storage.username || storage.password || storage.search || storage.hash || storage.pathname !== "/" || env.NEON_STORAGE_BUCKET !== target.bucket || env.AWS_REGION !== "ap-southeast-1" || env.STORAGE_PROVIDER_MODE !== "neon") throw new Error("COMPUTE_STORAGE_TARGET_MISMATCH");
  const renderer = new URL(env.DIKTAT_RENDERER_URL);
  if (env.NEXT_PUBLIC_APP_URL !== target.appOrigin || renderer.origin !== target.rendererOrigin || renderer.username || renderer.password || renderer.search || renderer.hash || renderer.pathname !== "/") throw new Error("COMPUTE_SERVICE_TARGET_MISMATCH");
}
