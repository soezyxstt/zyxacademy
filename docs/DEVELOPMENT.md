# Development Guide

## Quick Start

```bash
bun install
cp .env.example .env.local  # fill in secrets
bun run dev                  # http://localhost:3000
```

## Available Commands

| Command | Purpose |
|---------|---------|
| `bun run dev` | Start dev server (Turbo mode) |
| `bun run build` | Production build |
| `bun run start` | Start production server |
| `bun run lint` | Run ESLint |
| `bun run typecheck` | bunx tsc --noEmit |
| `bun run test` | Run all Bun test suites |
| `bun run test:ai-contracts` | Run deterministic AI contract tests (`tests/contracts`) |
| `bun run db:generate` | Generate Drizzle migration from schema changes |
| `bun run db:migrate` | Apply migrations to local SQLite |
| `bun run db:push:prod` | Safe production migration (backup + verify) |
| `bun run db:seed` | Seed local DB with test data |
| `bun --env-file=.env.staging run staging:preflight` | Fail-closed staging identity check |
| `bun --env-file=.env.staging run staging:inventory -- --run-id <runId> --phase before` | Write a keyed staging inventory artifact |
| `bun --env-file=.env.staging run staging:export -- --run-id <runId>` | Create an encrypted staging recovery export |
| `bun --env-file=.env.staging run staging:migrate -- --run-id <runId> --plan <plan>` | Apply guarded staging migrations |
| `bun --env-file=.env.staging run staging:reconcile -- --run-id <runId> --expect additive` | Reconcile before and after manifests |
| `bun --env-file=.env.staging run staging:backfill-peran -- --run-id <runId>` | Backfill `pengguna` and legacy role memberships |
| `bun --env-file=.env.staging run staging:backfill-peran -- --run-id <runId> --rerun` | Verify idempotent role backfill |
| `bun --env-file=.env.staging run staging:seed-peran-smoke -- --run-id <runId> --email <existingAdminEmail>` | Add an idempotent tutor membership to the explicitly selected active staging admin for Plan 002 smoke |
| `bun --env-file=.env.staging run staging:classify-role-literals -- --run-id <runId>` | Classify remaining `teacher` and `student` literals |
| `bun --env-file=.env.staging run staging:smoke-auth -- --run-id <runId> --roles admin,tutor,murid,multi` | Validate staging sessions against canonical memberships |
| `bun --env-file=.env.staging run staging:reconcile-peran -- --run-id <runId>` | Reconcile Plan 002 identity and role parity |

## Environment Variables

Configured via `.env.local`. All vars are validated at startup by `lib/env.ts` (`@t3-oss/env-nextjs`).

### Required
- `DATABASE_URL` ; local SQLite path (e.g. `file:dev.db`) or Turso URL
- `BETTER_AUTH_SECRET` ; 32+ char high-entropy secret (`openssl rand -base64 32`)
- `BETTER_AUTH_URL` ; app origin for OAuth callbacks
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` ; Google OAuth
- `UPLOADTHING_TOKEN` ; UploadThing API token
- `GEMINI_API_KEY` ; Google Gemini API key (4-key rotation supported)
- `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` ; Inngest job queue

### Optional ; Storage
- `R2_ENDPOINT`, `R2_BUCKET`, `R2_PUBLIC_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` ; Cloudflare R2
- `STORAGE_PROVIDER_MODE` ; `r2` (default) or `uploadthing`

### Optional ; AI Gateway
- `CF_AI_GATEWAY_URL`, `CF_AI_GATEWAY_TOKEN` ; Cloudflare AI Gateway
- `CF_ACCOUNT_ID`, `CF_KV_NAMESPACE_ID`, `CF_API_TOKEN` ; KV cache for tutor

### Optional ; Vector Store
- `PINECONE_API_KEY`, `PINECONE_INDEX_NAME` ; Pinecone (default)
- `VECTOR_STORE` ; `pinecone` (dev) | `dual` | `vectorize`
- `VECTORIZE_WORKER_URL`, `VECTORIZE_SHARED_SECRET` ; Cloudflare Vectorize

### Optional ; Production Services
- `DIKTAT_RENDERER_URL`, `DIKTAT_RENDERER_SECRET` ; Puppeteer PDF service
- `NEXT_PUBLIC_REALTIME_URL`, `LIVE_HMAC_SECRET` ; Live quiz Worker
- `WHATSAPP_ADMIN_NUMBER` ; Admin WhatsApp notifications
- `SENTRY_*` ; Error tracking

### Staging overhaul guard

Remote staging commands must load `.env.staging`, set `ZYX_ENVIRONMENT=staging`, and set `ALLOW_STAGING_MUTATION=1` only for an explicitly reviewed write. `STAGING_EXPORT_KEY` is supplied outside Git and is required for keyed manifests and encrypted exports. Production counterparts are compared before a staging command can continue. Do not use `db:sync-prod-to-staging`; its replacement is the separately named destructive command `db:sync-prod-to-staging:destructive`, which also requires the explicit confirmation phrase.

## Feature Flags

All gated by `FEATURE_*` env vars. Absent or `"0"` = hidden/disabled.

`FEATURE_PERAN_V2` must remain absent or `0` until the Plan 002 identity backfill, parity checks, and active-session auth smoke all pass. The legacy `user.role` column remains a compatibility projection during this phase.

`FEATURE_ARSITEKTUR_IDE_V1` remains absent or `0` after Plan 003. The schema and contracts are additive; no existing KO or source caller switches to `ide` until a later predecessor-gated plan.

| Flag | Feature |
|------|---------|
| `FEATURE_MASTERY` | Mastery score tracking |
| `FEATURE_TODAY` | Daily recommendations |
| `FEATURE_EMBED` | Learning context fabric (EIF E0) |
| `FEATURE_MISCONCEPTION` | Distractor analytics (EIF E1) |
| `FEATURE_REMEDIATION` | Quiz remediation (EIF E2) |
| `FEATURE_MATERIAL_LIVE` | Interactive material layer (EIF E3) |
| `FEATURE_FC_DIFFICULTY` | Flashcard difficulty (EIF E4) |
| `FEATURE_GRAPH` | Concept graph (EIF E5) |
| `FEATURE_ARSITEKTUR_IDE_V1` | Canonical source and Idea domain rollout |
| `FEATURE_TUTOR_RAG` | Grounded AI tutor pipeline (P3) |
| `FEATURE_FEEDBACK` | Answer feedback |
| `FEATURE_STUDY_PATH` | Personalized study paths |
| `FEATURE_TUTOR_ANALYTICS` | Tutor analytics dashboard |
| `FEATURE_LIVE` | Real-time classroom (P9) |
| `FEATURE_REFLECTION` | Weekly reflections |
| `FEATURE_REFLECTION_EMAIL` | Reflection email delivery |
| `FEATURE_ADAPTIVE_QUIZ` | Adaptive quiz difficulty |
| `FEATURE_PKA` | Tutorial PKA campaign |
| `FEATURE_PERAN_V2` | Indonesian domain identity and multi-role authorization |
| `FEATURE_AI_CONTRACT_V2` | Versioned prompt contracts, policy composition, bounded repair, and provenance |
| `FEATURE_ASSESSMENT_ASSISTANCE_POLICY` | Deterministic assessment assistance policy for AI tutor and mistake feedback |
| `FEATURE_TUTOR_PIPELINE_V2` | V2 tutor cache isolation and query action routing |
| `FEATURE_KO_PIPELINE_V2` | Staged KO extraction, deterministic chunking, cross-chunk reconciliation, and canonical review |
| `FEATURE_QUESTION_GENERATOR_V2` | Question blueprint engine, application option shuffle, and machine-readable distractor provenance |
| `FEATURE_ANALYTICS` | Coaching analytics |
| `FEATURE_LEADERBOARD` | Leaderboard |
| `FEATURE_PUBLISHER` | Publisher features |

## Code Conventions

- **DB schema**: `db/schema.ts` only. Edit → `bun run db:generate` → `bun run db:migrate`. Never hand-edit `drizzle/`.
- **Auth**: Better-Auth (credentials + Google OAuth). Canonical access roles: `admin`, `tutor`, `murid`; `user.role` remains a legacy compatibility projection during expand.
- **AI calls**: All Gemini traffic routes through Cloudflare AI Gateway when `CF_AI_GATEWAY_URL` is set.
- **Cost rule**: AI quota is spent only on tutoring, mistake feedback, and content generation. Streaks, recommendations, study paths, reflections are deterministic SQL + logic.

## Type Checking & Linting

```bash
bun run lint          # ESLint
bunx tsc --noEmit      # Full type check
bun run build         # Production build (catches all errors)
```

## AI Contract Testing

All AI contract test suites live in `tests/contracts/` and run without network calls.

### Running Tests

- Run full AI contract suite: `bun run test:ai-contracts`
- Run single test file: `bun test tests/contracts/prompt-executor.test.ts`

### Adding Fixtures

1. Place JSON fixtures inside `tests/fixtures/ai/<family>.json`.
2. Every fixture file must contain `"schemaVersion": "1.0"` and a valid `"requirementId"` (e.g. `"AI-TUTOR-CIT-001"`).
3. Load fixtures using `loadAiFixture("<family>.json")` from `@/tests/helpers/ai-fixtures`.

### Contract Tests vs Model Quality Evaluations

- **Contract Tests (`tests/contracts/`)**: Deterministic, zero network calls, unit-isolated, mock/fake adapters (`fakeAi`, `fakeCache`), validating system invariants and schema structures.
- **Model Quality Evaluations**: Live model benchmarks evaluating accuracy, reasoning quality, or LLM output style requiring active API keys.

