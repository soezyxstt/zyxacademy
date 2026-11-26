import { verificationBrowserProvider } from "./product-v4-browser-config";

/** Configuration discovery only. Browser credentials can belong to the worker. */
export function productV4ExecutionCapability(env: Record<string, string | undefined> = process.env) {
  const provider = verificationBrowserProvider(env as NodeJS.ProcessEnv);
  let origin: string | null = null;
  let environment: "staging" | "production" | "local" | "unknown" = "unknown";
  try {
    const url = new URL(env.BETTER_AUTH_URL || env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error();
    origin = url.origin;
    environment = origin === "https://staging.zyxacademy.com" ? "staging"
      : ["https://www.zyxacademy.com", "https://zyxacademy.com"].includes(origin) ? "production"
      : url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ? "local" : "unknown";
    for (const declared of [env.ZYX_ENVIRONMENT, env.ZYX_MCP_ENVIRONMENT]) if (declared && declared !== environment) environment = "unknown";
    if (env.BETTER_AUTH_URL && env.NEXT_PUBLIC_APP_URL && new URL(env.NEXT_PUBLIC_APP_URL).origin !== origin) environment = "unknown";
  } catch { environment = "unknown"; }
  const local = provider === "local_playwright";
  const supportedEnvironments = local ? ["production"] : ["staging", "production"];
  const available = supportedEnvironments.includes(environment) && (!local || origin === "https://www.zyxacademy.com");
  return {
    provider, environment, origin, mode: local ? "local_operator" as const : "server_job" as const,
    supportedEnvironments, available, health: "not_checked" as const,
    availabilityMeaning: "The configured provider supports this target. Worker credentials, quota and service health require execution.",
    requestTool: "authoring.verify_product_bundle" as const, getTool: "authoring.get_verification" as const,
    ...(local ? { command: "node scripts/authoring/run-product-v4-local.mjs --input <absolute-input-json-path>" } : {}),
    nextAction: !available
      ? { kind: "inspect_runtime" as const, instruction: "The configured verifier does not support this target. Fix its environment-specific configuration; do not change content or switch environments." }
      : local
        ? { kind: "run_local_operator" as const, instruction: "Run the private local operator for this exact revision. Polling alone does not execute a local attempt." }
        : { kind: "request_verification" as const, tool: "authoring.verify_product_bundle" as const, instruction: "Request verification using the current content and plan hashes, then read the returned attempt. Keep content unchanged when no current attempt exists." },
  };
}

export function assertProductV4ExecutionTarget(env: Record<string, string | undefined> = process.env) {
  const execution = productV4ExecutionCapability(env);
  if (!execution.available) throw new Error("PRODUCT_V4_VERIFICATION_EXECUTOR_UNAVAILABLE");
  return execution;
}
