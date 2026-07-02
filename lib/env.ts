import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';
import { resolveAuthBaseUrl } from '@/lib/auth-site-url';
import { publicAppUrlSchema } from '@/lib/public-app-url';

export const env = createEnv({
 server: {
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
 /** From https://uploadthing.com/dashboard ; replaces direct S3/Tigris uploads. */
 UPLOADTHING_TOKEN: z.string().min(1),
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
 /** Pinecone API Key for vector search (required for AI quiz generation) */
 PINECONE_API_KEY: z.string().transform((v) => v || undefined).optional(),
 /** Pinecone index name (e.g. "zyx-edu") */
 PINECONE_INDEX_NAME: z.string().transform((v) => v || undefined).optional(),
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
 /** Storage provider mode: 'r2' | 'uploadthing' (default: uploadthing) */
 STORAGE_PROVIDER_MODE: z.enum(['r2', 'uploadthing']).optional(),
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
 /** Cloudflare account ID (used for KV REST API and Workers) */
 CF_ACCOUNT_ID: z.string().optional(),
 /** Cloudflare Workers KV namespace ID for zyx-ai-cache */
 CF_KV_NAMESPACE_ID: z.string().optional(),
 /** Cloudflare API token with Workers KV Storage: Edit permission */
 CF_API_TOKEN: z.string().optional(),
 FEATURE_MASTERY: z.string().optional(),
 FEATURE_TODAY: z.string().optional(),
 /** EIF E0 learning-context fabric and embedded surfaces. "1" enables. */
 FEATURE_EMBED: z.string().optional(),
 /** EIF E1 distractor analytics + deterministic misconception feedback. "1" enables. */
 FEATURE_MISCONCEPTION: z.string().optional(),
 /** EIF E2 quiz remediation surfacing (mastery delta + root cause). "1" enables. */
 FEATURE_REMEDIATION: z.string().optional(),
 /** EIF E3 interactive material layer (highlight to KO actions). "1" enables. */
 FEATURE_MATERIAL_LIVE: z.string().optional(),
 /** EIF E4 flashcard recall difficulty + SM-2 blend. "1" enables. */
 FEATURE_FC_DIFFICULTY: z.string().optional(),
 /** EIF E5 navigable concept graph + tutor root cause. "1" enables. */
 FEATURE_GRAPH: z.string().optional(),
 /** P3 grounded tutor pipeline (RAG + KV cache + learner memory). "1" enables. */
 FEATURE_TUTOR_RAG: z.string().optional(),
 FEATURE_FEEDBACK: z.string().optional(),
 FEATURE_STUDY_PATH: z.string().optional(),
 /** P6A tutor analytics MVP. "1" enables /tutor area for teacher role. */
 FEATURE_TUTOR_ANALYTICS: z.string().optional(),
 /** P9 real-time classroom. "1" enables live quiz routes. */
 FEATURE_LIVE: z.string().optional(),
 /** Shared secret for HMAC token generation and Worker auth (P9). */
 LIVE_HMAC_SECRET: z.string().optional(),
 FEATURE_REFLECTION: z.string().optional(),
 FEATURE_REFLECTION_EMAIL: z.string().optional(),
 /** Adaptive quiz difficulty: bias a quiz's easy/medium/hard mix by the student's course mastery. "1" enables. */
 FEATURE_ADAPTIVE_QUIZ: z.string().optional(),
 /** Tutorial PKA campaign: free multi-stage PKA simulation course + auto-enroll link + admin announcements. "1" enables. */
 FEATURE_PKA: z.string().optional(),
 // ── P8 Vectorize Migration ─────────────────────────────────────────────
 /** Active vector store: 'pinecone' (default) | 'dual' (write both) | 'vectorize' (read from VZ) */
 VECTOR_STORE: z.enum(['pinecone', 'vectorize', 'dual']).optional(),
 /** Base URL of the deployed zyx-vector-api Cloudflare Worker (no trailing slash) */
 VECTORIZE_WORKER_URL: z.string().url().optional(),
  /** Shared secret matching SHARED_SECRET set on the zyx-vector-api Worker */
  VECTORIZE_SHARED_SECRET: z.string().optional(),
  // ── Diktat PDF Renderer ──────────────────────────────────────────────
  /** Base URL of the diktat-renderer Puppeteer service (Railway/Docker) */
  DIKTAT_RENDERER_URL: z.string().url().optional(),
  /** Shared secret matching SHARED_SECRET set on the diktat-renderer service */
  DIKTAT_RENDERER_SECRET: z.string().optional(),
  },
 client: {
 /** Absolute origin for better-auth client (e.g. https://app.example.com). Falls back for local dev. */
 NEXT_PUBLIC_APP_URL: publicAppUrlSchema,
 /** Desmos API key from https://www.desmos.com/my-api ; embeds the graphing calculator on the landing lab when set. */
 NEXT_PUBLIC_DESMOS_API_KEY: z.string().optional(),
 /**
 * Nomor WhatsApp publik (fallback jika `WHATSAPP_ADMIN_NUMBER` tidak diset di server).
 * Hanya angka; `+`/spasi diperbolehkan.
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
  },
 runtimeEnv: {
 NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
 NEXT_PUBLIC_DESMOS_API_KEY: process.env.NEXT_PUBLIC_DESMOS_API_KEY,
 NEXT_PUBLIC_WHATSAPP_NUMBER: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER,
 NEXT_PUBLIC_BRAND_EMAIL: process.env.NEXT_PUBLIC_BRAND_EMAIL,
 NEXT_PUBLIC_BRAND_INSTAGRAM: process.env.NEXT_PUBLIC_BRAND_INSTAGRAM,
 NEXT_PUBLIC_BRAND_TIKTOK: process.env.NEXT_PUBLIC_BRAND_TIKTOK,
 DATABASE_URL: process.env.DATABASE_URL,
 TURSO_CONNECTION_URL: process.env.TURSO_CONNECTION_URL,
 TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
 BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
 BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
 GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
 GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
 UPLOADTHING_TOKEN: process.env.UPLOADTHING_TOKEN,
 RESEND_API_KEY: process.env.RESEND_API_KEY,
 WHATSAPP_ADMIN_NUMBER: process.env.WHATSAPP_ADMIN_NUMBER,
 GEMINI_API_KEY: process.env.GEMINI_API_KEY,
 GEMINI_API_KEY_2: process.env.GEMINI_API_KEY_2,
 GEMINI_API_KEY_3: process.env.GEMINI_API_KEY_3,
 GEMINI_API_KEY_4: process.env.GEMINI_API_KEY_4,
 PINECONE_API_KEY: process.env.PINECONE_API_KEY,
 PINECONE_INDEX_NAME: process.env.PINECONE_INDEX_NAME,
 INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
 INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
 // R2
 R2_ENDPOINT: process.env.R2_ENDPOINT,
 R2_BUCKET: process.env.R2_BUCKET,
 R2_PUBLIC_URL: process.env.R2_PUBLIC_URL,
 R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
 R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
 STORAGE_PROVIDER_MODE: process.env.STORAGE_PROVIDER_MODE,
 // AI Gateway
 CF_AI_GATEWAY_URL: process.env.CF_AI_GATEWAY_URL,
 CF_AI_GATEWAY_TOKEN: process.env.CF_AI_GATEWAY_TOKEN,
 CF_API_TOKEN: process.env.CF_API_TOKEN,
 CF_KV_NAMESPACE_ID: process.env.CF_KV_NAMESPACE_ID,
 CF_ACCOUNT_ID: process.env.CF_ACCOUNT_ID,
 FEATURE_MASTERY: process.env.FEATURE_MASTERY,
 FEATURE_TODAY: process.env.FEATURE_TODAY,
 FEATURE_EMBED: process.env.FEATURE_EMBED,
 FEATURE_MISCONCEPTION: process.env.FEATURE_MISCONCEPTION,
 FEATURE_REMEDIATION: process.env.FEATURE_REMEDIATION,
 FEATURE_MATERIAL_LIVE: process.env.FEATURE_MATERIAL_LIVE,
 FEATURE_FC_DIFFICULTY: process.env.FEATURE_FC_DIFFICULTY,
 FEATURE_GRAPH: process.env.FEATURE_GRAPH,
 FEATURE_TUTOR_RAG: process.env.FEATURE_TUTOR_RAG,
 FEATURE_FEEDBACK: process.env.FEATURE_FEEDBACK,
 FEATURE_STUDY_PATH: process.env.FEATURE_STUDY_PATH,
 FEATURE_TUTOR_ANALYTICS: process.env.FEATURE_TUTOR_ANALYTICS,
 FEATURE_LIVE: process.env.FEATURE_LIVE,
 LIVE_HMAC_SECRET: process.env.LIVE_HMAC_SECRET,
 FEATURE_REFLECTION: process.env.FEATURE_REFLECTION,
 FEATURE_REFLECTION_EMAIL: process.env.FEATURE_REFLECTION_EMAIL,
 FEATURE_ADAPTIVE_QUIZ: process.env.FEATURE_ADAPTIVE_QUIZ,
 FEATURE_PKA: process.env.FEATURE_PKA,
  NEXT_PUBLIC_REALTIME_URL: process.env.NEXT_PUBLIC_REALTIME_URL,
 VECTOR_STORE: process.env.VECTOR_STORE,
 VECTORIZE_WORKER_URL: process.env.VECTORIZE_WORKER_URL,
  VECTORIZE_SHARED_SECRET: process.env.VECTORIZE_SHARED_SECRET,
  // Diktat PDF Renderer
  DIKTAT_RENDERER_URL: process.env.DIKTAT_RENDERER_URL,
  DIKTAT_RENDERER_SECRET: process.env.DIKTAT_RENDERER_SECRET,
  },
});
