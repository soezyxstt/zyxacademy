import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';
import { resolveAuthBaseUrl } from '@/lib/auth-site-url';
import { publicAppUrlSchema } from '@/lib/public-app-url';

export const env = createEnv({
  skipValidation:
    Boolean(process.env.SKIP_ENV_VALIDATION) ||
    process.env.npm_lifecycle_event === 'lint',
 server: {
 AUTHORING_TRANSFER_IDENTITY: z.string().optional(),
 AUTHORING_TRANSFER_PEERS: z.string().optional(),
 DATABASE_URL: z.string().min(1),
 TURSO_CONNECTION_URL: z.string().optional(),
 TURSO_AUTH_TOKEN: z.string().optional(),
 /**
 * Public origin of this app (no trailing path). Used for OAuth callbacks.
 * Prefer `BETTER_AUTH_URL`; falls back to `NEXT_PUBLIC_APP_URL`, then localhost.
 */
 BETTER_AUTH_URL: z.preprocess(() => resolveAuthBaseUrl(), z.string().url()),
 /**
 * Better Auth recommends ≥32 high-entropy chars (`openssl rand -base64 32`).
 * Shorter values still run in dev but will log security warnings.
 */
 BETTER_AUTH_SECRET: z.string().min(1),
 GOOGLE_CLIENT_ID: z.string(),
 GOOGLE_CLIENT_SECRET: z.string(),
 /** Primary Google OAuth Refresh Token for Google Workspace REST APIs (Meet, Forms, Sheets, Drive) */
 GOOGLE_REFRESH_TOKEN: z.string().optional(),
 /** Resend API Key for sending transactional emails. */
 RESEND_API_KEY: z.string().min(1),
 /** Nomor WhatsApp admin (digits; `+`/spaces allowed). Contoh: `6281234567890`. */
 WHATSAPP_ADMIN_NUMBER: z.string().optional(),
 /** Gemini API Key for AI operations (primary) */
 GEMINI_API_KEY: z.string().min(1),
 /** Gemini API Key #2 for failover/load balancing */
 GEMINI_API_KEY_2: z.string().optional(),
 /** Gemini API Key #3 for failover/load balancing */
 GEMINI_API_KEY_3: z.string().optional(),
 /** Gemini API Key #4 for failover/load balancing */
 GEMINI_API_KEY_4: z.string().optional(),
 /** Non-secret alias for Gemini project slot 1. */
 GEMINI_PROJECT_ALIAS_1: z.string().optional(),
 /** Non-secret alias for Gemini project slot 2. */
 GEMINI_PROJECT_ALIAS_2: z.string().optional(),
 /** Non-secret alias for Gemini project slot 3. */
 GEMINI_PROJECT_ALIAS_3: z.string().optional(),
 /** Non-secret alias for Gemini project slot 4. */
 GEMINI_PROJECT_ALIAS_4: z.string().optional(),
 /** Inngest event key for sending events */
 INNGEST_EVENT_KEY: z.string().min(1),
 /** Inngest signing key for production request verification */
 INNGEST_SIGNING_KEY: z.string().optional(),
 // ── Cloudflare R2 Storage ──────────────────────────────────────────────
 /** Cloudflare R2 S3-compatible endpoint URL */
 R2_ENDPOINT: z.string().url().optional(),
 /** Cloudflare R2 bucket name */
 R2_BUCKET: z.string().optional(),
 /** Cloudflare R2 public access URL (without trailing slash) */
 R2_PUBLIC_URL: z.string().optional(),
 /** Cloudflare R2 access key ID */
 R2_ACCESS_KEY_ID: z.string().optional(),
 /** Cloudflare R2 secret access key */
 R2_SECRET_ACCESS_KEY: z.string().optional(),
 /** Storage provider mode: 'r2' | 'uploadthing' (default: r2) */
 STORAGE_PROVIDER_MODE: z.string().optional(),
 // ── Cloudflare AI Gateway ──────────────────────────────────────────────
 /**
 * Cloudflare AI Gateway base URL for Gemini requests.
 * Format: https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/google-ai-studio
 * When set, all Gemini SDK requests are routed through the gateway.
 * Leave unset to use the Gemini API directly.
 */
 CF_AI_GATEWAY_URL: z.string().url().optional(),
 /** Cloudflare AI Gateway token for Authorization header */
 CF_AI_GATEWAY_TOKEN: z.string().optional(),
 /** Absolute origin of the staging Zyra control-plane Worker. */
 ZYRA_CONTROL_PLANE_URL: z.string().url().optional(),
 /** Server-only bearer token for the Zyra control-plane Worker. */
 ZYRA_CONTROL_PLANE_TOKEN: z.string().optional(),
 /** Cloudflare account ID (used for KV REST API and Workers) */
 AUTHORING_VERIFICATION_BROWSER_PROVIDER: z.enum(["cloudflare", "steel"]).optional(),
 AUTHORING_VERIFICATION_STEEL_BROWSER_VERSION: z.string().regex(/^\d+\.\d+\.\d+\.\d+$/).optional(),
 STEEL_API_KEY: z.string().optional(),
 CF_ACCOUNT_ID: z.string().optional(),
 /** Cloudflare Workers KV namespace ID for zyx-ai-cache */
 CF_KV_NAMESPACE_ID: z.string().optional(),
 /** Cloudflare API token with Workers KV Storage: Edit permission */
 CF_API_TOKEN: z.string().optional(),
  /** P9 real-time classroom. "1" enables live quiz routes. */
  FEATURE_LIVE: z.string().optional(),
  /** Shared secret for HMAC token generation and Worker auth (P9). */
  LIVE_HMAC_SECRET: z.string().optional(),
  /** Email pengingat dan ringkasan refleksi mingguan. */
  FEATURE_REFLECTION_EMAIL: z.string().optional(),
  /** Tutorial PKA campaign: free multi-stage PKA simulation course + auto-enroll link + admin announcements. "1" enables. */
  FEATURE_PKA: z.string().optional(),
  /** Profile-free exact and semantic cache. "1" enables the semantic gate. */
  FEATURE_ZYRA_SEMANTIC_CACHE_V1: z.string().optional(),
  /** Authenticated private learner image input for Zyra. "1" enables the multimodal path. */
  FEATURE_ZYRA_IMAGE_INPUT_V1: z.string().optional(),
  /** Dedicated staging-only user allowed to execute hidden pedagogy shadow comparisons. */
  STAGING_ZYRA_PEDAGOGY_USER_ID: z.string().optional(),
  /** Auto-grant editor access on every exported Google Spreadsheet and its Drive folder to all active admin emails. "1" enables. */
  FEATURE_DRIVE_EDITOR_SYNC: z.string().optional(),
  /** Optional AI-assisted Diktat audit suggestions. "1" enables. */
  FEATURE_DIKTAT_AI: z.string().optional(),
  /** Temporary rollout gate for structured Article V3 authoring, review, and student reading. */
  FEATURE_STRUCTURED_ARTICLE_READER_V1: z.string().optional(),
 // ── P8 Vectorize Migration ─────────────────────────────────────────────
 /** Base URL of the deployed zyx-vector-api Cloudflare Worker (no trailing slash) */
 VECTORIZE_WORKER_URL: z.string().url().optional(),
  /** Shared secret matching SHARED_SECRET set on the zyx-vector-api Worker */
  VECTORIZE_SHARED_SECRET: z.string().optional(),
  // ── Diktat PDF Renderer ──────────────────────────────────────────────
  /** Base URL of the diktat-renderer service (Cloudflare Worker with Browser Run Quick Actions) */
  DIKTAT_RENDERER_URL: z.string().url().optional(),
  /** Shared secret matching SHARED_SECRET set on the diktat-renderer service */
  DIKTAT_RENDERER_SECRET: z.string().optional(),
  AUTHORING_VERIFICATION_RENDERER_URL: z.string().url().optional(),
  AUTHORING_VERIFICATION_RENDERER_SECRET: z.string().optional(),
  // ── Sentry Error Monitoring ───────────────────────────────────────────
  /** Sentry auth token for source map uploads */
  SENTRY_AUTH_TOKEN: z.string().optional(),
  /** Sentry organization slug */
  SENTRY_ORG: z.string().optional(),
  /** Sentry project slug */
  SENTRY_PROJECT: z.string().optional(),
  /** Sentry public key */
  SENTRY_PUBLIC_KEY: z.string().optional(),
  /** Sentry OTLP traces ingest endpoint */
  SENTRY_OTLP_TRACES_URL: z.string().url().optional(),
  /** Sentry Vercel log drain endpoint */
  SENTRY_VERCEL_LOG_DRAIN_URL: z.string().url().optional(),
  },
 client: {
 /** Absolute origin for better-auth client (e.g. https://app.example.com). Falls back for local dev. */
 NEXT_PUBLIC_APP_URL: publicAppUrlSchema,
 /** Sentry DSN for client error reporting and tracing */
 NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
 /** Desmos API key from https://www.desmos.com/my-api ; embeds the graphing calculator on the landing lab when set. */
 NEXT_PUBLIC_DESMOS_API_KEY: z.string().optional(),
 /**
 * Nomor WhatsApp publik untuk tautan konsultasi paket di browser.
 * Hanya angka; `+`/spasi diperbolehkan. Tanpa nilai, tautan tidak ditampilkan.
 */
 NEXT_PUBLIC_WHATSAPP_NUMBER: z.string().optional(),
  /** Base URL of the Cloudflare Worker for real-time quiz (P9). e.g. https://zyx-realtime.workers.dev */
  NEXT_PUBLIC_REALTIME_URL: z.string().url().optional(),
  /** Email resmi brand Zyx Academy. */
  NEXT_PUBLIC_BRAND_EMAIL: z.string().email().optional().default("contact@zyxacademy.com"),
  /** Akun Instagram resmi brand Zyx Academy. */
  NEXT_PUBLIC_BRAND_INSTAGRAM: z.string().url().optional().default("https://instagram.com/zyx_academy"),
  /** Akun TikTok resmi brand Zyx Academy. */
  NEXT_PUBLIC_BRAND_TIKTOK: z.string().url().optional().default("https://tiktok.com/@zyx_academy"),
  /** PostHog Project API Key for feature flags and analytics */
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  /** PostHog API Host URL (default: https://us.i.posthog.com) */
  NEXT_PUBLIC_POSTHOG_HOST: z.string().url().optional().default("https://us.i.posthog.com"),
  NEXT_PUBLIC_FEATURE_ZYRA_IMAGE_INPUT_V1: z.enum(["0", "1"]).optional(),
  },
  runtimeEnv: {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,
  NEXT_PUBLIC_DESMOS_API_KEY: process.env.NEXT_PUBLIC_DESMOS_API_KEY,
  NEXT_PUBLIC_WHATSAPP_NUMBER: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER,
  NEXT_PUBLIC_BRAND_EMAIL: process.env.NEXT_PUBLIC_BRAND_EMAIL,
  NEXT_PUBLIC_BRAND_INSTAGRAM: process.env.NEXT_PUBLIC_BRAND_INSTAGRAM,
  NEXT_PUBLIC_BRAND_TIKTOK: process.env.NEXT_PUBLIC_BRAND_TIKTOK,
  NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  NEXT_PUBLIC_FEATURE_ZYRA_IMAGE_INPUT_V1: process.env.NEXT_PUBLIC_FEATURE_ZYRA_IMAGE_INPUT_V1,
  DATABASE_URL: process.env.DATABASE_URL,
  TURSO_CONNECTION_URL: process.env.TURSO_CONNECTION_URL,
  TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN: process.env.GOOGLE_REFRESH_TOKEN,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  WHATSAPP_ADMIN_NUMBER: process.env.WHATSAPP_ADMIN_NUMBER,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_API_KEY_2: process.env.GEMINI_API_KEY_2,
  GEMINI_API_KEY_3: process.env.GEMINI_API_KEY_3,
  GEMINI_API_KEY_4: process.env.GEMINI_API_KEY_4,
  GEMINI_PROJECT_ALIAS_1: process.env.GEMINI_PROJECT_ALIAS_1,
  GEMINI_PROJECT_ALIAS_2: process.env.GEMINI_PROJECT_ALIAS_2,
  GEMINI_PROJECT_ALIAS_3: process.env.GEMINI_PROJECT_ALIAS_3,
  GEMINI_PROJECT_ALIAS_4: process.env.GEMINI_PROJECT_ALIAS_4,
  INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
  INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
  // R2
  AUTHORING_TRANSFER_IDENTITY: process.env.AUTHORING_TRANSFER_IDENTITY,
  AUTHORING_TRANSFER_PEERS: process.env.AUTHORING_TRANSFER_PEERS,
  R2_ENDPOINT: process.env.R2_ENDPOINT,
  R2_BUCKET: process.env.R2_BUCKET,
  R2_PUBLIC_URL: process.env.R2_PUBLIC_URL,
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
  STORAGE_PROVIDER_MODE: process.env.STORAGE_PROVIDER_MODE,
  // AI Gateway
  CF_AI_GATEWAY_URL: process.env.CF_AI_GATEWAY_URL,
  CF_AI_GATEWAY_TOKEN: process.env.CF_AI_GATEWAY_TOKEN,
  ZYRA_CONTROL_PLANE_URL: process.env.ZYRA_CONTROL_PLANE_URL,
  ZYRA_CONTROL_PLANE_TOKEN: process.env.ZYRA_CONTROL_PLANE_TOKEN,
  CF_API_TOKEN: process.env.CF_API_TOKEN,
  CF_KV_NAMESPACE_ID: process.env.CF_KV_NAMESPACE_ID,
  AUTHORING_VERIFICATION_BROWSER_PROVIDER: process.env.AUTHORING_VERIFICATION_BROWSER_PROVIDER,
  AUTHORING_VERIFICATION_STEEL_BROWSER_VERSION: process.env.AUTHORING_VERIFICATION_STEEL_BROWSER_VERSION,
  STEEL_API_KEY: process.env.STEEL_API_KEY,
  CF_ACCOUNT_ID: process.env.CF_ACCOUNT_ID,
  FEATURE_LIVE: process.env.FEATURE_LIVE,
  LIVE_HMAC_SECRET: process.env.LIVE_HMAC_SECRET,
  FEATURE_REFLECTION_EMAIL: process.env.FEATURE_REFLECTION_EMAIL,
  FEATURE_PKA: process.env.FEATURE_PKA,
  FEATURE_ZYRA_SEMANTIC_CACHE_V1: process.env.FEATURE_ZYRA_SEMANTIC_CACHE_V1,
  FEATURE_ZYRA_IMAGE_INPUT_V1: process.env.FEATURE_ZYRA_IMAGE_INPUT_V1,
  STAGING_ZYRA_PEDAGOGY_USER_ID: process.env.STAGING_ZYRA_PEDAGOGY_USER_ID,
  FEATURE_DRIVE_EDITOR_SYNC: process.env.FEATURE_DRIVE_EDITOR_SYNC,
  FEATURE_DIKTAT_AI: process.env.FEATURE_DIKTAT_AI,
  FEATURE_STRUCTURED_ARTICLE_READER_V1: process.env.FEATURE_STRUCTURED_ARTICLE_READER_V1,
 NEXT_PUBLIC_REALTIME_URL: process.env.NEXT_PUBLIC_REALTIME_URL,
 VECTORIZE_WORKER_URL: process.env.VECTORIZE_WORKER_URL,
 VECTORIZE_SHARED_SECRET: process.env.VECTORIZE_SHARED_SECRET,
  // Diktat PDF Renderer
  DIKTAT_RENDERER_URL: process.env.DIKTAT_RENDERER_URL,
  DIKTAT_RENDERER_SECRET: process.env.DIKTAT_RENDERER_SECRET,
  AUTHORING_VERIFICATION_RENDERER_URL: process.env.AUTHORING_VERIFICATION_RENDERER_URL,
  AUTHORING_VERIFICATION_RENDERER_SECRET: process.env.AUTHORING_VERIFICATION_RENDERER_SECRET,
  // Sentry Error Monitoring
  SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
  SENTRY_ORG: process.env.SENTRY_ORG,
  SENTRY_PROJECT: process.env.SENTRY_PROJECT,
  SENTRY_PUBLIC_KEY: process.env.SENTRY_PUBLIC_KEY,
  SENTRY_OTLP_TRACES_URL: process.env.SENTRY_OTLP_TRACES_URL,
  SENTRY_VERCEL_LOG_DRAIN_URL: process.env.SENTRY_VERCEL_LOG_DRAIN_URL,
  },
});
