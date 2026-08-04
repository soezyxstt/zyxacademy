# Deployment Guide

## Architecture

Production runs on Vercel (Next.js) + Turso (DB) with supporting Cloudflare services.

```

## Staging overhaul execution

Staging migrations use only `.env.staging` and the guarded commands below. Run the preflight before and after every remote step. The commands emit masked resource fingerprints and artifacts under `artifacts/staging-overhaul/<runId>/`.

```bash
bun --env-file=.env.staging run staging:preflight
bun --env-file=.env.staging run staging:inventory -- --run-id <runId> --phase before
bun --env-file=.env.staging run staging:migrate -- --run-id <runId> --plan <plan>
bun --env-file=.env.staging run staging:inventory -- --run-id <runId> --phase after
bun --env-file=.env.staging run staging:reconcile -- --run-id <runId> --expect additive
```

The old production-to-staging sync is not part of the overhaul. Any exceptional destructive sync must use the dedicated `db:sync-prod-to-staging:destructive` command and an explicit confirmation phrase after a separate operator review.
Vercel (Next.js App Router)
 ├── Turso (libsql database)
 ├── Cloudflare R2 (object storage)
 ├── Inngest Cloud (background jobs)
 ├── Cloudflare AI Gateway (Gemini proxy)
 ├── Cloudflare Vectorize (canonical 768-dimensional vector store)
 └── Cloudflare Workers (3 services)
```

## Vercel Deployment

1. Connect repo to Vercel
2. Set all env vars from `lib/env.ts` in Vercel dashboard
3. Deploy ; App Router + Server Actions work natively

## Turso Database

### Setup
```bash
# Install Turso CLI
bun install -g turso
turso auth login

# Create database
turso db create zyx-academy

# Create auth token
turso db create-token zyx-academy

# Set env vars:
# TURSO_CONNECTION_URL = libsql://...
# TURSO_AUTH_TOKEN = <token>
```

### Migration
```bash
bun run db:push:prod   # safe runner: backup → migrate → verify
```

The production migration script (`db/push-prod.ts`):
1. Backs up all tables to `drizzle/backups/`
2. Verifies DB connectivity
3. Applies pending migrations
4. Validates row counts (detects data loss)
5. Checks foreign key integrity

## Cloudflare Workers

Three Workers support the app:

### 1. zyx-vector-api (Vectorize proxy)
```
workers/vector-api/
├── wrangler.toml
├── index.ts
```

- Exposes only authenticated `/v2/upsert`, `/v2/query`, `/v2/delete`, `/v2/list`, and `/v2/get` routes
- Canonical `/v2/get` hydration is sent in batches of at most 20 IDs per request
- Staging binds only `VECTORIZE_V2` to `zyx-vectors-staging-v2`; the 1024-dimensional indexes remain unbound preservation resources
- Staging sets `RESTRICTED_SOLUTION_CAPABILITY` so published solution queries require the server-side capability check

```bash
cd workers/vector-api
wrangler deploy
wrangler secret put SHARED_SECRET
```

### 2. zyxrealtime (Live quiz WebSocket/SSE)
```
workers/realtime/
├── wrangler.toml
├── src/index.ts
```

- Durable Object `LiveQuizRoom` for real-time quiz sessions
- Deployed separately via `wrangler deploy`

```bash
cd workers/realtime
wrangler deploy
```

### 3. zyxacademydiktat (PDF renderer)
- Puppeteer service hosted on Railway
- Receives HTML → renders A4 PDF → returns to app
- Configured via `DIKTAT_RENDERER_URL` + `DIKTAT_RENDERER_SECRET`

## External Services Reference

| Service | Usage | Free Tier Limit |
|---|---|---|
| R2 | Object storage (PDFs, assets) | 10 GB, zero egress |
| Cloudflare Vectorize | Canonical 768-dimensional vector store | 2 GB Serverless Starter |
| Cloudflare AI Gateway | Gemini proxy, caching, rate limiting | 100k logged req/mo |
| Cloudflare KV | AI response cache | 100k reads/day, 1k writes/day |
| Inngest | Background job orchestration | 50k steps/mo |
| Resend | Transactional emails | 100 emails/day |
| Firebase Cloud Messaging | Push notifications | Free |
| Sentry | Error tracking | 5k events/mo |
| UploadThing | Dev file upload fallback | 2 GB |

### Data Seeding

Production seed data (courses, chapters, bundles) is imported via:
```bash
# Import a learning bundle
bunx tsx scripts/import-bundle.ts --bundle <learning-bundle.json> --mode create --post-process

# Import an assessment bundle
bunx tsx scripts/import-bundle.ts --assessment-bundle <assessment-bundle.json> --mode create --post-process

# Production migration (safe: backup + verify)
bun run db:push:prod
```

## PKA Campaign

The PKA (Tutorial Akademik) campaign is a seasonal product. Deploy steps:
1. Enable `FEATURE_PKA` in Vercel env
2. Configure PKA stages via admin panel
3. Seed quiz templates for each stage
4. Enable registration window via admin announcements

## Feature Flags

All `FEATURE_*` env vars default to off. Enable gradually per environment. See [DEVELOPMENT.md](./DEVELOPMENT.md#feature-flags) for the full list.
## Authoring Context Pack V1

Keep `FEATURE_AUTHORING_CONTEXT_V1` absent or `0` until the local contract suite and staging round trip pass. The export API is admin-only by default, stores artifacts under the exact run-specific prefix `overhaul/<runId>/authoring-context/`, and records the object key, checksum, policy version, holdout exclusion count, and retention timestamp in `audit_mutasi`.

The artifact must use the private R2 staging bucket and must not use a public URL. The authenticated Wrangler adapter is limited to the staging test process when normal R2 credentials are unavailable; production runtime keeps the standard R2 provider. Rollback disables the flag and deletes only an explicitly named test object by exact key.

## Product Bundle V2

Keep `FEATURE_PRODUCT_BUNDLE_V2` absent or `0` until local contract gates and the staging product-bundle rehearsal pass. The workflow uses the normal private R2 storage abstraction for staged ZIP artifacts and writes product publication, dependency, audit, and vector outbox records transactionally. Run the staging test with `.env.staging` and the authenticated Wrangler fallback only when the script explicitly enables it. Do not enable the flag in production as part of Plan 008; production rollout remains out of scope.

## Plan 017 audit rework

The branch-local rework adds no table, migration, provider, or deployment requirement. Keep `FEATURE_PRODUCT_BUNDLE_V2`, the canonical Idea and assessment flags, and the canonical Vectorize runtime disabled until the local gates pass and a separate staging rehearsal is approved. The rework routes only approved Article, question, and solution products to canonical Vectorize namespaces, excludes holdout references, and appends per-Idea evidence only for exact published mappings. Rollback is branch-only during this phase; switching back to `staging` requires no data rollback.
