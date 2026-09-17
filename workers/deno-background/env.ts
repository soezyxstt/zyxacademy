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
  // Database
  DATABASE_URL: optionalString,
  TURSO_CONNECTION_URL: optionalString,
  TURSO_DATABASE_URL: optionalString,
  TURSO_AUTH_TOKEN: optionalString,

  // Inngest
  INNGEST_EVENT_KEY: optionalString,
  INNGEST_SIGNING_KEY: optionalString,
  INNGEST_SERVE_ORIGIN: optionalUrl.default("https://zyx-background.soezyxst.deno.net"),
  INNGEST_SERVE_PATH: z.string().default("/api/inngest"),

  // Diktat PDF renderer (Cloudflare Browser Run Quick Action Worker)
  DIKTAT_RENDERER_URL: optionalUrl,
  DIKTAT_RENDERER_SECRET: optionalString,

  // AI & Vector
  GEMINI_API_KEY: optionalString,
  GEMINI_API_KEY_2: optionalString,
  GEMINI_API_KEY_3: optionalString,
  GEMINI_API_KEY_4: optionalString,
  CF_AI_GATEWAY_URL: optionalUrl,
  CF_AI_GATEWAY_TOKEN: optionalString,
  VECTORIZE_WORKER_URL: optionalUrl,
  VECTORIZE_SHARED_SECRET: optionalString,

  // Storage
  R2_ENDPOINT: optionalUrl,
  R2_BUCKET: optionalString,
  R2_ACCESS_KEY_ID: optionalString,
  R2_SECRET_ACCESS_KEY: optionalString,

  // Services
  RESEND_API_KEY: optionalString,
  NEXT_PUBLIC_BRAND_EMAIL: optionalString,
  COMPUTE_SERVICE_SECRET: optionalString,
  DENO_DEPLOYMENT_ID: optionalString,
  NODE_ENV: z.string().default("production"),
});

export type WorkerEnv = z.infer<typeof WorkerEnvSchema>;

function getRuntimeEnv(): Record<string, string | undefined> {
  if (typeof process !== "undefined" && process.env) {
    return process.env;
  }
  if (typeof (globalThis as any).Deno !== "undefined") {
    return (globalThis as any).Deno.env.toObject();
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
