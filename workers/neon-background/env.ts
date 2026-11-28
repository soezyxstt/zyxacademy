import { z } from "zod";

const optionalString = z.preprocess(
  (value) => typeof value === "string" && value.trim().length === 0 ? undefined : value,
  z.string().min(1).optional()
);

const optionalUrl = z.preprocess(
  (value) => typeof value === "string" && value.trim().length === 0 ? undefined : value,
  z.string().url().optional()
);

export const WorkerEnvSchema = z.object({
  ZYX_ENVIRONMENT: optionalString,
  // Database
  DATABASE_URL: optionalString,
  ZYRA_CONTROL_PLANE_URL: optionalUrl,
  ZYRA_CONTROL_PLANE_TOKEN: optionalString,
  TURSO_CONNECTION_URL: optionalString,
  TURSO_DATABASE_URL: optionalString,
  TURSO_AUTH_TOKEN: optionalString,

  QUEUE_PROVIDER: z.enum(["cloud-tasks", "memory", "noop"]).default("cloud-tasks"),

  // Worker public origin (used as Cloud Tasks OIDC audience)
  WORKER_ORIGIN: optionalUrl,
  INNGEST_SERVE_ORIGIN: optionalUrl,

  // Diktat PDF renderer (Cloudflare Browser Run Quick Action Worker)
  DIKTAT_RENDERER_URL: optionalUrl,
  DIKTAT_RENDERER_SECRET: optionalString,
  BETTER_AUTH_SECRET: optionalString,
  CF_API_TOKEN: optionalString,
  CF_ACCOUNT_ID: optionalString,
  CF_KV_NAMESPACE_ID: optionalString,
  AUTHORING_VERIFICATION_BROWSER_PROVIDER: z.enum(["cloudflare", "steel", "local_playwright"]).optional(),
  AUTHORING_VERIFICATION_STEEL_BROWSER_VERSION: z.string().regex(/^\d+\.\d+\.\d+\.\d+$/).optional(),
  STEEL_API_KEY: optionalString,
  NEXT_PUBLIC_APP_URL: optionalUrl,

  // AI & Vector
  GEMINI_API_KEY: optionalString,
  GEMINI_API_KEY_2: optionalString,
  GEMINI_API_KEY_3: optionalString,
  GEMINI_API_KEY_4: optionalString,
  GEMINI_PROJECT_ALIAS_1: optionalString,
  GEMINI_PROJECT_ALIAS_2: optionalString,
  GEMINI_PROJECT_ALIAS_3: optionalString,
  GEMINI_PROJECT_ALIAS_4: optionalString,
  CF_AI_GATEWAY_URL: optionalUrl,
  CF_AI_GATEWAY_TOKEN: optionalString,
  AI_PROVIDERS: optionalString,
  AI_META_GATEWAY_ROUTE: optionalString,
  AI_OPENAI_BYOK_ALIASES: optionalString,
  AI_META_BYOK_ALIASES: optionalString,
  AI_DEEPSEEK_BYOK_ALIASES: optionalString,
  AI_OPENAI_MODEL: optionalString,
  AI_OPENAI_MODEL_2: optionalString,
  AI_OPENAI_MODEL_3: optionalString,
  AI_OPENAI_MODEL_4: optionalString,
  AI_META_MODEL: optionalString,
  AI_META_MODEL_2: optionalString,
  AI_META_MODEL_3: optionalString,
  AI_META_MODEL_4: optionalString,
  AI_META_MODEL_5: optionalString,
  AI_DEEPSEEK_MODEL: optionalString,
  AI_DEEPSEEK_MODEL_2: optionalString,
  AI_DEEPSEEK_MODEL_3: optionalString,
  VECTORIZE_WORKER_URL: optionalUrl,
  VECTORIZE_SHARED_SECRET: optionalString,

  // Storage
  R2_ENDPOINT: optionalUrl,
  R2_BUCKET: optionalString,
  R2_PUBLIC_URL: optionalString,
  R2_ACCESS_KEY_ID: optionalString,
  R2_SECRET_ACCESS_KEY: optionalString,

  // Admin external-operation providers
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  GOOGLE_REFRESH_TOKEN: optionalString,
  FIREBASE_SERVICE_ACCOUNT_JSON: optionalString,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: optionalString,
  FEATURE_DRIVE_EDITOR_SYNC: optionalString,
  BETTER_AUTH_URL: optionalUrl,

  // Services
  RESEND_API_KEY: optionalString,
  NEXT_PUBLIC_BRAND_EMAIL: optionalString,
  COMPUTE_SERVICE_SECRET: optionalString,
  NODE_ENV: z.string().default("production"),
});

export type WorkerEnv = z.infer<typeof WorkerEnvSchema>;

function getRuntimeEnv(): Record<string, string | undefined> {
  if (typeof process !== "undefined" && process.env) {
    return process.env;
  }
  return {};
}

export function validateWorkerEnv(source?: Record<string, string | undefined>): WorkerEnv {
  const envSource = source ?? getRuntimeEnv();
  const result = WorkerEnvSchema.safeParse(envSource);
  if (!result.success) {
    console.error("Worker environment validation failed:", result.error.format());
    throw new Error("INVALID_WORKER_ENV");
  }
  return result.data;
}
