# Deployment Guide

## Architecture

Production runs on Vercel (Next.js) + Turso (DB) with supporting Cloudflare services.

## Duitku

Keep the payment feature disabled during deployment and migration. Configure the Duitku project callback as `/api/payments/duitku/callback` on the public HTTPS application origin. Sandbox and production use separate Merchant Code and Merchant Key values; switch `DUITKU_ENVIRONMENT` and credentials together. Enable `FEATURE_DUITKU_PAYMENT=1` only after a Sandbox checkout, valid callback, invalid-signature rejection, amount-mismatch rejection, duplicate-callback test, status-page review, and merchant contact review pass.

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

## Zyra Plans 008 through 014 staging boundary

Plans 008 through 013 are additive implementations in this checkpoint. Migration `0067_zyra_continuation.sql` was applied to remote staging on 2026-08-12 after encrypted export and disposable restore validation. Reconciliation recorded 164 tables, 7 additive tables, and zero foreign-key violations. It was not applied to production. Their feature flags remain absent or `0`.

Plan 010 requires the dedicated private attachment bucket and the normal R2 or staging Wrangler private adapter. Do not set `STORAGE_PROVIDER_MODE=uploadthing` for the multimodal path. Image source bytes are never sent directly from the browser to a provider and no public object URL is issued.

Gemini Interactions requests bypass `CF_AI_GATEWAY_URL` and use the direct Google endpoint. GenerateContent requests, including the `gemini-2.5-flash` multimodal fallback, continue through Cloudflare AI Gateway. Vercel logs expose only privacy-safe provider code, HTTP status, retry classification, model, endpoint family, transport, and request ID.

Plan 014 must be run with the staging environment file and an approved cap. The synthetic verifier is safe to run while local work is dirty, but it must report `BLOCKED`. A live provider matrix requires explicit operator approval after Plan 007 remote shadow and maintainer review, predecessor artifacts, backup and identity checks, and final diff review all pass. No Plan 008 through 014 command authorizes production deployment.

## Zyra control-plane staging foundation

Plan 001 is staging-only. Run the guarded preflight before the first remote step:

```bash
bun --env-file=.env.staging run staging:zyra-control:preflight -- --run-id <runId>
```

The preflight requires `ZYX_ENVIRONMENT=staging`, `ALLOW_STAGING_MUTATION=1`, and the root `CLOUDFLARE_API_TOKEN`. The ignored staging `ZYRA_CONTROL_PLANE_TOKEN` is optional locally when the remote Worker secret is verified with `wrangler secret list`; its value is supplied through an interactive secret operation and is never committed or printed. Wrangler commands must authenticate to the verified staging account and must not use `wrangler login`.

The Worker configuration is `workers/zyra-control-plane/wrangler.jsonc` and must be deployed with `--env staging`. The deployment binds `zyx-staging`, `zyx-zyra-private-staging`, `zyx-zyra-cache-staging`, and `zyx_zyra_events_staging`. The private R2 bucket has no public domain, and the semantic cache must remain separate from all canonical and preserved rollback indexes. Production Workers, production R2, and 1024-dimensional Vectorize indexes are outside this plan.

## Zyra model registry staging probe

Plan 002 keeps the provider registry flag off by default. Run the deterministic mock probe before any provider call:

```bash
bun --env-file=.env.staging run staging:probe-gemini-models -- --mock --run-id <runId>
```

The bounded real probe is staging-only, requires four Gemini key slots and four non-secret project aliases in `.env.staging`, requires an explicit `--max-requests`, and is capped at 40 requests. It records only model, project alias, key-slot name, latency, dimensions, status, and typed error metadata. It never records prompts, responses, key values, or authenticated URLs. Do not use `.env.local` or production credentials for this probe. Keep `FEATURE_AI_PROVIDER_REGISTRY_V1` absent or `0` until the real four-project evidence and quarantine health gate are complete.

## Zyra quota coordinator staging smoke

Plan 003 extends the already provisioned staging Worker with a single SQLite-backed Durable Object coordinator. The local test suite and Wrangler dry-run must pass before any deployment. The synthetic smoke reserves, dispatches, and commits leases without Gemini calls, then verifies four-project ceilings, fairness, exact terminal reconciliation, and privacy-safe diagnostics.

```bash
bun --env-file=.env.staging scripts/staging/smoke-zyra-quota.ts --local --synthetic-concurrency 100 --run-id <runId>
```

The Plan 003 Worker version has been deployed only to the approved staging Worker and verified with health 200, unauthorized diagnostics 401 JSON, authenticated diagnostics 200 JSON, and a passed remote synthetic smoke with 60 accepted reservations, 40 expected quota rejections, 60 committed transitions, fairness spread 0, and zero synthetic provider calls. Evidence is recorded in `artifacts/zyra-ai/20260807-plan003-final/plan-003-result.json`. Do not copy or print the bearer secret. Never run this step against a production Worker, production Durable Object, or production resource.

## Zyra application allowances

Plan 004 uses the guarded staging migration runner for the additive `ai_allowance_leases` table. The reviewed staging-backed application canary passed with the flag enabled only in its local process, then the flag was off afterward. The read-only manifest is captured before and after migration, and strict reconciliation verifies that legacy usage and trace manifests are unchanged, committed leases have derived compatibility events, and no invalid lease status exists.

## Zyra health-aware provider routing

Plan 005 keeps `FEATURE_ZYRA_PROVIDER_ROUTER_V2` disabled by default. Its server-only lifecycle reserves the application allowance first, then a staging Worker project-model lease, dispatches both before calling Gemini, and commits or refunds without a direct-after-Gateway duplicate. AI Gateway metadata is bounded and privacy-safe; personalized and active-assessment requests bypass Gateway cache and payload logging.

The bounded staging smoke is:

```bash
bun --env-file=.env.staging scripts/staging/smoke-zyra-provider-router.ts --run-id <runId> --max-provider-requests 40
```

It requires the existing staging control-plane secret plus configured control-plane URL, AI Gateway URL/token, four Gemini key slots, four distinct non-secret project aliases, and a dedicated staging router identity. The accepted staging run uses a bounded 3.1-second application pacing interval to respect the 20-per-minute admin allowance. It completed 40 of 40 provider requests, used four project slots, selected only `gemini-3.1-flash-lite`, recorded zero quarantined traffic, restored the feature flag, and performed no production deployment. Evidence: `artifacts/zyra-ai/20260807-plan005-provider-router-paced-v1/plan-005-provider-router.json`.

## Zyra privacy-safe semantic cache

Plan 006 uses the staging-only `zyx-zyra-cache-staging` Vectorize index at 768 dimensions with cosine distance. It is separate from the canonical content index and stores only profile-free scaffold metadata plus an opaque cache entry reference. The Worker handles exact cache reads and writes, Durable Object single-flight, the 900-write daily ceiling, and semantic candidate revalidation. `FEATURE_ZYRA_SEMANTIC_CACHE_V1` remains disabled unless the reviewed staging cache smoke enables it for the process.

The accepted staging verification is:

```bash
bun --env-file=.env.staging scripts/staging/smoke-zyra-cache.ts --run-id <runId> --max-provider-requests 20
```

The smoke passed with one single-flight leader, 49 followers, one strict semantic match, zero cache provider units, and zero real provider calls. Evidence: `artifacts/zyra-ai/20260807-plan006-cache-smoke-v10/plan-006-cache-smoke.json`. Creating metadata indexes for this separate staging resource was additive and did not change production resources.

## Zyra pedagogical harness

Plan 007 keeps `FEATURE_ZYRA_PEDAGOGY_V3` disabled by default. When enabled for a reviewed process, the server selects the teaching state and hint level before the model call, validates canonical citations and assessment safety after the call, and uses deterministic safe composition on failure. The contract sets one total model attempt, so the ordinary turn has no hidden repair call. Personal guidance calls remain disabled on this path until the later personalization plan.

Plan 007 remote shadow is staging-only and opt-in. Configure the non-secret `STAGING_ZYRA_PEDAGOGY_USER_ID` only in the ignored `.env.staging` file, then invoke the smoke script with `--remote-shadow`. The runner verifies staging resource fingerprints, exact active murid identity, current legacy and canonical enrollment, and published canonical question evidence before any model call. A 40-request cap permits at most five cases under the current seven-call upper bound per case. The runner never changes the public feature flag, never saves duplicate chat messages, and never writes learner summary or learning-event state.

Before a remote retry, use `--startup-diagnostics-only`. This mode performs Turso SELECT checks and local module imports only; provider calls, Vectorize queries, control-plane leases, trace writes, and learner writes remain zero. Canonical and tutor imports use the scoped Zyra runtime env contract and do not require unrelated UploadThing or Resend credentials. The latest diagnostic reached the database but stopped at `session_context` with `PEDAGOGY_STARTUP_ACTIVE_SESSION_MISSING`; it made zero provider calls and writes. The older all-stage artifact remains historical evidence: `artifacts/staging-overhaul/20260808-plan007-startup-diagnostics-v3/plan-007-pedagogy-startup-diagnostics.json`.

After a passing shadow, open `plan-007-pedagogy-human-review.html` from the run artifact directory. The maintainer scores all five dimensions and downloads a JSON submission. Run `bun scripts/staging/validate-zyra-pedagogy-review.ts --run-id <runId> --submission-file <path>` to create `plan-007-result.json`. The release gate passes only when remote shadow evidence and the strict human rubric both pass.

The current staging-only check is:

```bash
bun --env-file=.env.staging scripts/staging/smoke-zyra-pedagogy.ts --run-id <runId> --course tutorial-pka --max-provider-requests 40
```

The fixture shadow validates 40 of 40 cases with zero provider calls. Remote shadow remains pending a dedicated staging identity and maintainer review; no production flag or resource is changed. Evidence: `artifacts/zyra-ai/20260807-plan007-pedagogy-eval/plan-007-pedagogy-eval.json` and `artifacts/staging-overhaul/20260807-plan007-pedagogy-shadow-v1/plan-007-pedagogy-shadow.json`.

## Zyra evidence-based personalization

Plan 008 uses additive migration `0067_zyra_continuation.sql` for bounded learning evidence, inferred profiles, explicit preferences, and the Plan 010 through 013 records. Keep `FEATURE_ZYRA_PERSONALIZATION_V1` absent or `0` until the Plan 008 staging gate is approved. The local synthetic smoke is privacy-safe and makes zero provider calls and zero database writes:

```bash
bun --env-file=.env.staging run staging:smoke-zyra-personalization -- --run-id <runId> --course tutorial-pka
```

The smoke does not deploy a Worker, enable a public flag, or mutate staging. Schema reconciliation is complete. A future functional gate must verify profile-free shared payloads, course ownership, expiry, reset, explicit preference override, and zero cross-course leakage. Plan 007 remote shadow and maintainer review remain separately pending at this checkpoint.

## Zyra typed Learning Canvas

Plan 009 is currently local-ready. Keep `FEATURE_ZYRA_LEARNING_CANVAS_V1` absent or `0` until the visual staging gate is approved. The local evaluation and synthetic staging smoke are:

```bash
bun run eval:zyra-canvas
bun --env-file=.env.staging run staging:smoke-zyra-canvas -- --run-id <runId> --course tutorial-pka
```

The smoke validates one bounded synthetic spec, records masked resource fingerprints, and makes zero provider calls, database writes, trace writes, learner side effects, and control-triggered network requests. A future remote gate must review fixture coverage, claim validation, accessibility, local state isolation, and active-assessment safety. No production flag or deployment is changed here.

## Zyra private images and operations

Plan 010 keeps `FEATURE_ZYRA_IMAGE_INPUT_V1` absent or `0` until its staging gate is approved. Private attachment reads and deletes require the exact course and chat-session scope in addition to authenticated owner or admin authorization. The attachment composer supplies both scope values when deleting an unsent upload. The expiry sweeper is controlled and staging-only:

```bash
bun --env-file=.env.staging run staging:sweep-zyra-attachments -- --run-id <runId> --limit 100
```

Plan 013 keeps `FEATURE_ZYRA_AI_OPS_V1` absent or `0` until live telemetry parity and admin review pass. Its metrics use the Asia/Jakarta day boundary and return only bounded alert codes, rollback flags, and references to `docs/operations/zyra-ops-runbooks.md`. No production resource or provider balance is inferred by these checks.

```bash
bun --env-file=.env.staging scripts/staging/manifest-ai-usage.ts --phase before --run-id <runId>
bun --env-file=.env.staging run staging:preflight
bun --env-file=.env.staging run staging:migrate -- --run-id <runId> --plan 004
bun --env-file=.env.staging run staging:preflight
bun --env-file=.env.staging scripts/staging/manifest-ai-usage.ts --phase after --run-id <runId>
bun --env-file=.env.staging scripts/staging/reconcile-ai-usage.ts --run-id <runId> --strict
```

This procedure mutates only the verified staging database. It does not deploy the Next application, change any `.env*` file, or access production.

## Product Bundle V2

Keep `FEATURE_PRODUCT_BUNDLE_V2` absent or `0` until local contract gates and the staging product-bundle rehearsal pass. The workflow uses the normal private R2 storage abstraction for staged ZIP artifacts and writes product publication, dependency, audit, and vector outbox records transactionally. Run the staging test with `.env.staging` and the authenticated Wrangler fallback only when the script explicitly enables it. Do not enable the flag in production as part of Plan 008; production rollout remains out of scope.

## Plan 017 audit rework

The branch-local rework adds no table, migration, provider, or deployment requirement. Keep `FEATURE_PRODUCT_BUNDLE_V2`, the canonical Idea and assessment flags, and the canonical Vectorize runtime disabled until the local gates pass and a separate staging rehearsal is approved. The rework routes only approved Article, question, and solution products to canonical Vectorize namespaces, excludes holdout references, and appends per-Idea evidence only for exact published mappings. Rollback is branch-only during this phase; switching back to `staging` requires no data rollback.
