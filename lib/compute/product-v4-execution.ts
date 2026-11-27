import { verificationBrowserProvider } from "./product-v4-browser-config";
import type { ProductV4VerificationPurpose } from "@/lib/bundle/product-v4-verification";

/** Logic runs on the server. Only final PDF generation selects a browser provider. */
export function productV4ExecutionCapability(purpose: ProductV4VerificationPurpose = "logic", env: Record<string, string | undefined> = process.env) {
  if (!["logic", "pdf"].includes(purpose)) throw new Error("PRODUCT_V4_VERIFICATION_PURPOSE_INVALID");
  let provider: ReturnType<typeof verificationBrowserProvider> | null = null;
  let configurationFailure: "VERIFICATION_BROWSER_PROVIDER_INVALID" | undefined;
  if (purpose === "pdf") {
    try { provider = verificationBrowserProvider(env as NodeJS.ProcessEnv); }
    catch (error) {
      if (!(error instanceof Error) || error.message !== "VERIFICATION_BROWSER_PROVIDER_INVALID") throw error;
      configurationFailure = "VERIFICATION_BROWSER_PROVIDER_INVALID";
    }
  }
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
  const supportedEnvironments = configurationFailure ? [] : local ? ["production"] : ["staging", "production"];
  const available = supportedEnvironments.includes(environment) && (!local || origin === "https://www.zyxacademy.com");
  return {
    purpose, provider, environment, origin, mode: local ? "local_operator" as const : "server_job" as const,
    supportedEnvironments, available, health: "not_checked" as const,
    ...(configurationFailure ? { configurationFailure } : {}),
    availabilityMeaning: purpose === "logic"
      ? "The server supports logic verification for this target. No browser, screenshot or PDF is required. Queue and service health require execution."
      : configurationFailure ? "Repair the PDF browser provider configuration before requesting PDF generation."
      : "The configured provider supports PDF generation for this target. Worker credentials, quota and service health require execution.",
    requestTool: "authoring.verify_product_bundle" as const, getTool: "authoring.get_verification" as const,
    ...(local ? { command: "node scripts/authoring/run-product-v4-local.mjs --input <absolute-input-json-path>" } : {}),
    nextAction: !available
      ? { kind: "inspect_runtime" as const, purpose, instruction: "The configured verifier does not support this target. Fix its environment-specific configuration; do not change content or switch environments." }
      : local
        ? { kind: "run_local_operator" as const, purpose: "pdf" as const, instruction: "Run the private PDF operator for this exact revision, then read its attempt with purpose pdf. Polling alone does not execute a local attempt." }
        : { kind: "request_verification" as const, tool: "authoring.verify_product_bundle" as const, purpose, instruction: `Request ${purpose === "pdf" ? "final Diktat PDF generation" : "logic verification"} using the current content and plan hashes with purpose ${purpose}, then read the returned attempt using the same purpose. Keep content unchanged when no current attempt exists.` },
  };
}

export function assertProductV4ExecutionTarget(purpose: ProductV4VerificationPurpose = "logic", env: Record<string, string | undefined> = process.env) {
  const execution = productV4ExecutionCapability(purpose, env);
  if (!execution.available) throw new Error("PRODUCT_V4_VERIFICATION_EXECUTOR_UNAVAILABLE");
  return execution;
}
