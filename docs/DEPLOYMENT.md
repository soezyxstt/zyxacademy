# Deployment Guide

## Architecture

Production runs on Vercel (Next.js) + Turso (DB) with Deno Deploy (background compute) and supporting Cloudflare services.

```
Vercel (Next.js App Router)
 ├── Turso (libsql database)
 ├── Inngest Cloud (background orchestration)
 │    └── Deno Deploy (background worker: zyx-background / zyx-background-staging)
 ├── Cloudflare R2 (object storage)
 ├── Cloudflare AI Gateway (Gemini proxy)
 ├── Cloudflare Vectorize (canonical 768-dimensional vector store)
 └── Cloudflare Workers (3 production services plus the staging-only Zyra control plane)
```

## Deno Deploy Background Worker Deployment

Background execution is handled by Deno Deploy, orchestrated via Inngest. Deployment is 100% automated through GitHub Actions (`.github/workflows/deploy.yml`):

- **Staging (`staging` branch)**:
  - App Name: `zyx-background-staging`
  - URL: `https://zyx-background-staging.soezyxst.deno.net`
  - GitHub Environment: `staging`
- **Production (`main` branch)**:
  - App Name: `zyx-background`
  - URL: `https://zyx-background.soezyxst.deno.net`
  - GitHub Environment: `production`

### Automated Pipeline Capabilities

The deployment workflow performs the following actions automatically on push (filtered to worker-relevant paths) or manual `workflow_dispatch`:
1. **Pre-deploy Verification**: Runs `worker:deno:audit` (dependency tree guard) and `worker:deno:check` (typecheck). Before deployment, `workers/deno-background/diktat-assets-smoke.ts` also verifies embedded KaTeX fonts and the contact footer with the worker import map, a dummy database URL, and no network permission.
2. **Dynamic Provisioning**: Automatically provisions the Deno Deploy app via `deno deploy create` if it does not already exist.
3. **Environment Sync**: Synchronizes all repository and environment secrets to Deno Deploy via `deno deploy env load --replace`.
4. **Zero-downtime Deploy**: Runs `deno run -A jsr:@deno/deploy@0.0.9904 --non-interactive --org soezyxst --app $APP_NAME --prod` with a 10 minute step timeout. The CLI version is pinned so CI never floats to an untested release.
5. **Automated Healthcheck**: Polls `$APP_URL/health` to confirm database connectivity and runtime health.
6. **Automated Inngest Sync**: Calls the Inngest Cloud API via `POST https://api.inngest.com/v2/apps/zyx-academy/syncs` with per-environment `INNGEST_API_KEY` and body `{"url": "$APP_URL/api/inngest"}` to register background functions without manual dashboard steps. `INNGEST_SIGNING_KEY` stays in the worker env for request verification and is not used for sync. Staging and production use separate Inngest environment keys so the shared app id `zyx-academy` does not overwrite the other environment.
7. **Renderer env sync**: Synchronizes `DIKTAT_RENDERER_URL` and `DIKTAT_RENDERER_SECRET` to Deno Deploy alongside the other secrets. Set matching per-environment values in the `staging` and `production` GitHub Environments, sourced from the `zyx-diktat-renderer-staging` and `zyx-diktat-renderer` Workers.

### Deno Deploy upload manifest

The root `deno.json` `deploy.exclude` list keeps unrelated areas (`app/`, `components/`, `tests/`, `drizzle/`, `public/`, `scripts/`, sibling workers, lockfiles) out of the diffsync upload. The worker only needs its import graph (`workers/deno-background`, `jobs/`, `db/`, `lib/`, `prompts/`) plus root configs. Before adding a new top-level area to the repository, confirm no worker-graph file imports it with `deno run -A scripts/audit-worker-dependencies.ts --list`; before excluding an area, confirm the same command lists zero files under it.

### Diffsync handshake failure signature

If the deploy step prints a revision URL but fails 2 to 3 seconds later with `Top-level await promise never resolved` and never prints `Loaded previously uploaded files`, the CLI never received the server's `missing_hashes` while the server kept waiting for the upload (`Awaiting for N files`, then `Build cancelled`). This is a production-app handshake stall, not a code regression: audit, typecheck, and env sync all pass first, and the same commit deploys cleanly to staging. On failure the workflow now prints manifest stats (tracked file count, bytes, largest files, graph size). Open the revision in the Deno dashboard, check for a wedged `building` revision blocking the queue, and compare the app build config against `zyx-background-staging`.

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

Workers support the app:

Cloudflare tracing is enabled for each Wrangler-managed Worker through
`observability.traces.enabled`. This makes Worker runtime traces, including
Cloudflare Agent activity when an Agent framework is used, available in the
Cloudflare dashboard. No payload recording is configured by this repository.

### 1. zyx-vector-api (Vectorize proxy)
```
workers/vector-api/
├── wrangler.toml
├── index.ts
```

- Exposes authenticated `/v2/upsert`, `/v2/query`, `/v2/delete`, `/v2/list`, and `/v2/get` routes
- Canonical `/v2/get` hydration is sent in batches of at most 20 IDs per request
- Production keeps the legacy `VECTORIZE` binding to `zyx-edu` for rollback compatibility
- Production binds `VECTORIZE_V2` to `zyx-vectors-production-v2` and `VECTORIZE_SEARCH` to `zyx-site-search-production`
- The two production indexes must use 768 dimensions and cosine distance, matching the canonical embedding profile
- Staging binds `VECTORIZE_V2` to `zyx-vectors-staging-v2` and `VECTORIZE_SEARCH` to `zyx-site-search-staging`; staging does not reuse production indexes
- Staging sets `RESTRICTED_SOLUTION_CAPABILITY` so published solution queries require the server-side capability check

#### Production provisioning gate

The Git merge does not provision Vectorize resources. Do not run a production deploy, backfill, or cutover until both production indexes pass the read-only checks below with dimensions `768` and metric `cosine`. If either index is missing or has incompatible metadata, stop and obtain an owner decision before creating or replacing it.

Run these commands from the repository root. They inspect account access, index configuration, and the rendered Worker bindings only:

```bash
wrangler whoami
wrangler vectorize list
wrangler vectorize get zyx-vectors-production-v2
wrangler vectorize list-metadata-index zyx-vectors-production-v2
wrangler vectorize get zyx-site-search-production
wrangler deploy --dry-run --env="" --config workers/vector-api/wrangler.toml
wrangler deploy --dry-run --env staging --config workers/vector-api/wrangler.toml
```

If an approved production index is absent, create it only after the gate has recorded the absence and the owner has approved the mutation. These commands are instructions, not commands to run during a merge:

```bash
wrangler vectorize create zyx-vectors-production-v2 --dimensions=768 --metric=cosine
wrangler vectorize create zyx-site-search-production --dimensions=768 --metric=cosine
```

The canonical metadata index allowlist is limited to eight properties, below Vectorize's ten-index limit. Create each property once on `zyx-vectors-production-v2`; `version` is numeric and every other property is a string:

```bash
wrangler vectorize create-metadata-index zyx-vectors-production-v2 --property-name=namespace --type=string
wrangler vectorize create-metadata-index zyx-vectors-production-v2 --property-name=courseId --type=string
wrangler vectorize create-metadata-index zyx-vectors-production-v2 --property-name=chapterId --type=string
wrangler vectorize create-metadata-index zyx-vectors-production-v2 --property-name=entityType --type=string
wrangler vectorize create-metadata-index zyx-vectors-production-v2 --property-name=status --type=string
wrangler vectorize create-metadata-index zyx-vectors-production-v2 --property-name=version --type=number
wrangler vectorize create-metadata-index zyx-vectors-production-v2 --property-name=accessClass --type=string
wrangler vectorize create-metadata-index zyx-vectors-production-v2 --property-name=language --type=string
```

Set the Worker secret after the production Worker and index bindings have been verified. Never put the secret value in shell history, Git, or this document:

```bash
wrangler secret put SHARED_SECRET --env="" --config workers/vector-api/wrangler.toml
```

#### Backfill and cutover order

1. Complete the read-only account, index, metadata, and dry-run checks above.
2. Provision only missing resources, then repeat the read-only checks and record the dimensions, metric, binding names, and metadata index list.
3. Configure the Vercel production values `VECTORIZE_WORKER_URL` and `VECTORIZE_SHARED_SECRET` through the encrypted environment settings. The application must not receive the secret from source control.
4. Run the production-approved canonical backfill from Turso using the fixed `canonical-content-v2` Gemini Embedding 2 profile, exactly 768 dimensions, and resumable run artifacts. Do not use a 1024-dimensional fallback or switch models.
5. Reconcile the Turso manifest against Vectorize IDs, dimensions, and allowlisted metadata. Require zero missing IDs, extra IDs, metadata mismatches, and dimension mismatches.
6. Run the canonical golden retrieval checks, including published-solution denial without `read:published_solutions` and success with that capability. Record the result before enabling production traffic.
7. Deploy only after all checks pass, then monitor the Worker and application error rates before completing the retrieval cutover.

Keep `zyx-edu` and the legacy `VECTORIZE` binding during the entire rollout. For rollback, restore the previously verified application and Worker version, disable the v2 traffic path according to the reviewed release procedure, and keep both new indexes intact for investigation. Do not delete or repoint the 1024-dimensional legacy index, and do not send 768-dimensional vectors to it.

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

### 3. zyx-diktat-renderer (PDF renderer)
Cloudflare Worker dengan binding Browser Run (`env.BROWSER.quickAction("pdf", ...)`):
- Mengonversi HTML ke PDF A4 secara stateless tanpa manajemen session Puppeteer manual.
- Konfigurasi secret:
  - Production: `bunx wrangler secret put SHARED_SECRET --config workers/diktat-renderer/wrangler.jsonc`
  - Staging: `bunx wrangler secret put SHARED_SECRET --config workers/diktat-renderer/wrangler.jsonc --env staging`
- Deploy:
  - Production: `bun run prod:diktat-renderer:deploy`
  - Staging: `bun run staging:diktat-renderer:deploy`
- Konfigurasi di Next.js: `DIKTAT_RENDERER_URL` diarahkan ke URL Worker (misal `https://zyx-diktat-renderer.<subdomain>.workers.dev`) dan `DIKTAT_RENDERER_SECRET` disamakan dengan `SHARED_SECRET`.
- Implementasi Docker dan Express Railway lama telah dihapus sepenuhnya; renderer beroperasi penuh di Cloudflare Workers.

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

## Email Notification Preferences

Migration `0073_flashy_spitfire.sql` adds `email_notification_preferences`. Apply it before deploying the always-on settings, delivery, and unsubscribe workflow. Verify the settings page with a Google-authenticated account, then send one message from each optional category. Each delivered message must contain its visible unsubscribe link, a `List-Unsubscribe` URL, and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.

## Feature Flags

Feature flags are exception-based rollout controls, not a requirement for every new capability. Foundational authorization, canonical retrieval, assessment, learning, and pedagogy behavior is always-on. Before implementing a new capability or material behavior change, confirm whether it should be always-on or flag-gated. Any new flag needs a clear reason, default, scope, rollback behavior, owner, and removal condition. See [DEVELOPMENT.md](./DEVELOPMENT.md#feature-flags) for the current approved list.
## Authoring Context Pack V1

The export workflow is always-on and admin-only. Before any staging round trip, the local contract suite must pass. The export API stores artifacts under the exact run-specific prefix `overhaul/<runId>/authoring-context/`, and records the object key, checksum, policy version, holdout exclusion count, and retention timestamp in `audit_mutasi`.

The artifact must use the private R2 staging bucket and must not use a public URL. The authenticated Wrangler adapter is limited to the staging test process when normal R2 credentials are unavailable; production runtime keeps the standard R2 provider. Rollback disables the flag and deletes only an explicitly named test object by exact key.

## Zyra Plans 008 through 014 staging boundary

Plans 008 through 013 are additive implementations in this checkpoint. Migration `0067_zyra_continuation.sql` was applied to remote staging on 2026-08-12 after encrypted export and disposable restore validation. Reconciliation recorded 164 tables, 7 additive tables, and zero foreign-key violations. It was not applied to production. Their explicitly approved optional rollout flags remain separately controlled.

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

Plan 002 uses the model registry as the default route. Run the deterministic mock probe before any provider call:

```bash
bun --env-file=.env.staging run staging:probe-gemini-models -- --mock --run-id <runId>
```

The bounded real probe is staging-only, requires four Gemini key slots and four non-secret project aliases in `.env.staging`, requires an explicit `--max-requests`, and is capped at 40 requests. It records only model, project alias, key-slot name, latency, dimensions, status, and typed error metadata. It never records prompts, responses, key values, or authenticated URLs. Do not use `.env.local` or production credentials for this probe. The model registry is already the default route; use the retained provider-router flag only for its explicit lease-aware rollout.

## Zyra quota coordinator staging smoke

Plan 003 extends the already provisioned staging Worker with a single SQLite-backed Durable Object coordinator. The local test suite and Wrangler dry-run must pass before any deployment. The synthetic smoke reserves, dispatches, and commits leases without Gemini calls, then verifies four-project ceilings, fairness, exact terminal reconciliation, and privacy-safe diagnostics.

```bash
bun --env-file=.env.staging scripts/staging/smoke-zyra-quota.ts --local --synthetic-concurrency 100 --run-id <runId>
```

The Plan 003 Worker version has been deployed only to the approved staging Worker and verified with health 200, unauthorized diagnostics 401 JSON, authenticated diagnostics 200 JSON, and a passed remote synthetic smoke with 60 accepted reservations, 40 expected quota rejections, 60 committed transitions, fairness spread 0, and zero synthetic provider calls. Evidence is recorded in `artifacts/zyra-ai/20260807-plan003-final/plan-003-result.json`. Do not copy or print the bearer secret. Never run this step against a production Worker, production Durable Object, or production resource.

## Zyra application allowances

Plan 004 uses the guarded staging migration runner for the additive `ai_allowance_leases` table. The reviewed staging-backed application canary passed with the optional allowance capability enabled only in its local process, then the capability was off afterward. The read-only manifest is captured before and after migration, and strict reconciliation verifies that legacy usage and trace manifests are unchanged, committed leases have derived compatibility events, and no invalid lease status exists.

## Zyra health-aware provider routing

Plan 005 keeps the lease-aware provider router as an explicitly approved optional capability. Its server-only lifecycle reserves the application allowance first, then a staging Worker project-model lease, dispatches both before calling Gemini, and commits or refunds without a direct-after-Gateway duplicate. AI Gateway metadata is bounded and privacy-safe; personalized and active-assessment requests bypass Gateway cache and payload logging.

The bounded staging smoke is:

```bash
bun --env-file=.env.staging scripts/staging/smoke-zyra-provider-router.ts --run-id <runId> --max-provider-requests 40
```

It requires the existing staging control-plane secret plus configured control-plane URL, AI Gateway URL/token, four Gemini key slots, four distinct non-secret project aliases, and a dedicated staging router identity. The accepted staging run uses a bounded 3.1-second application pacing interval to respect the 20-per-minute admin allowance. It completed 40 of 40 provider requests, used four project slots, selected only `gemini-3.1-flash-lite`, recorded zero quarantined traffic, restored the optional capability setting, and performed no production deployment. Evidence: `artifacts/zyra-ai/20260807-plan005-provider-router-paced-v1/plan-005-provider-router.json`.

## Zyra privacy-safe semantic cache

Plan 006 uses the staging-only `zyx-zyra-cache-staging` Vectorize index at 768 dimensions with cosine distance. It is separate from the canonical content index and stores only profile-free scaffold metadata plus an opaque cache entry reference. The Worker handles exact cache reads and writes, Durable Object single-flight, the 900-write daily ceiling, and semantic candidate revalidation. `FEATURE_ZYRA_SEMANTIC_CACHE_V1` remains disabled unless the reviewed staging cache smoke enables it for the process.

The accepted staging verification is:

```bash
bun --env-file=.env.staging scripts/staging/smoke-zyra-cache.ts --run-id <runId> --max-provider-requests 20
```

The smoke passed with one single-flight leader, 49 followers, one strict semantic match, zero cache provider units, and zero real provider calls. Evidence: `artifacts/zyra-ai/20260807-plan006-cache-smoke-v10/plan-006-cache-smoke.json`. Creating metadata indexes for this separate staging resource was additive and did not change production resources.

## Zyra pedagogical harness

Plan 007 pedagogy is always-on. The server selects the teaching state and hint level before the model call, validates canonical citations and assessment safety after the call, and uses deterministic safe composition on failure. The contract sets one total model attempt, so the ordinary turn has no hidden repair call. Shadow comparison remains an explicit staging request, and personal guidance remains separately controlled by the retained personalization flag.

Plan 007 remote shadow is staging-only and opt-in. Configure the non-secret `STAGING_ZYRA_PEDAGOGY_USER_ID` only in the ignored `.env.staging` file, then invoke the smoke script with `--remote-shadow`. The runner verifies staging resource fingerprints, exact active murid identity, current legacy and canonical enrollment, and published canonical question evidence before any model call. A 40-request cap permits at most five cases under the current seven-call upper bound per case. The runner never changes public rollout settings, never saves duplicate chat messages, and never writes learner summary or learning-event state.

Before a remote retry, use `--startup-diagnostics-only`. This mode performs Turso SELECT checks and local module imports only; provider calls, Vectorize queries, control-plane leases, trace writes, and learner writes remain zero. Canonical and tutor imports use the scoped Zyra runtime env contract and do not require unrelated UploadThing or Resend credentials. The latest diagnostic reached the database but stopped at `session_context` with `PEDAGOGY_STARTUP_ACTIVE_SESSION_MISSING`; it made zero provider calls and writes. The older all-stage artifact remains historical evidence: `artifacts/staging-overhaul/20260808-plan007-startup-diagnostics-v3/plan-007-pedagogy-startup-diagnostics.json`.

After a passing shadow, open `plan-007-pedagogy-human-review.html` from the run artifact directory. The maintainer scores all five dimensions and downloads a JSON submission. Run `bun scripts/staging/validate-zyra-pedagogy-review.ts --run-id <runId> --submission-file <path>` to create `plan-007-result.json`. The release gate passes only when remote shadow evidence and the strict human rubric both pass.

The current staging-only check is:

```bash
bun --env-file=.env.staging scripts/staging/smoke-zyra-pedagogy.ts --run-id <runId> --course tutorial-pka --max-provider-requests 40
```

The fixture shadow validates 40 of 40 cases with zero provider calls. Remote shadow remains pending a dedicated staging identity and maintainer review; no production flag or resource is changed. Evidence: `artifacts/zyra-ai/20260807-plan007-pedagogy-eval/plan-007-pedagogy-eval.json` and `artifacts/staging-overhaul/20260807-plan007-pedagogy-shadow-v1/plan-007-pedagogy-shadow.json`.

## Zyra evidence-based personalization

Plan 008 uses additive migration `0067_zyra_continuation.sql` for bounded learning evidence, inferred profiles, explicit preferences, and the Plan 010 through 013 records. Personalization is always-on; the Plan 008 staging gate is a process gate, not an env flag. The local synthetic smoke is privacy-safe and makes zero provider calls and zero database writes:

```bash
bun --env-file=.env.staging run staging:smoke-zyra-personalization -- --run-id <runId> --course tutorial-pka
```

The smoke does not deploy a Worker, enable a public flag, or mutate staging. Schema reconciliation is complete. A future functional gate must verify profile-free shared payloads, course ownership, expiry, reset, explicit preference override, and zero cross-course leakage. Plan 007 remote shadow and maintainer review remain separately pending at this checkpoint.

## Zyra typed Learning Canvas

Plan 009 is local-ready and the canvas layer is always-on; the visual staging gate is a process gate, not an env flag. The local evaluation and synthetic staging smoke are:

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

The Product Bundle workflow is always-on; the staging product-bundle rehearsal remains a required process gate. The workflow uses the normal private R2 storage abstraction for staged ZIP artifacts and writes product publication, dependency, audit, and vector outbox records transactionally. Run the staging test with `.env.staging` and the authenticated Wrangler fallback only when the script explicitly enables it; production rollout review remains out of scope for local work.

## Structured Article V3

Structured Article V3 is additive and defaults off through `FEATURE_STRUCTURED_ARTICLE_READER_V1`. Migration generation, local application, staging database mutation, MCP regeneration, deployment, and flag enablement are separate steps. Disabling the flag rolls UI selection and submission requirements back to V2 while preserving V3 rows and artifacts. Use [the structured Article rollout runbook](operations/structured-article-v3-rollout.md) for preflight, inventory, reconciliation, visual gates, course rollout, and removal conditions.

## Provider-neutral Authoring MCP

The MCP endpoint is deployed as the Node.js route `/api/mcp/authoring` and uses the official Streamable HTTP transport. It is always available after deployment, but every request still requires a valid admin session or an MCP access token issued after an admin login. Source Pack ingestion requires original binaries for independent `originalSha256` verification; those binaries are not stored in the Source Pack ZIP. Originals may arrive as ephemeral base64 input or be resolved from encrypted stored-file references.

Prompt-only PDF authoring requires the active storage provider to implement server-side `download`. The default R2 provider and staging Wrangler R2 provider support it; a provider without download support fails closed. Only safe `courses/{course}/materials/*.pdf` keys are eligible. Page rendering uses the bundled `pdf-parse` worker under the existing Node.js runtime. No new environment variable, feature flag, database migration, remote URL fetch, or publication permission is introduced. Blob responses are limited to 32 MiB, stored originals to 50 MiB each, and aggregate originals to 96 MiB.

When enabling the endpoint, no MCP-specific static token or actor ID is configured. MCP authorization uses the existing Better Auth session through `/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`, `/api/mcp/oauth/register`, `/api/mcp/oauth/authorize`, and `/api/mcp/oauth/token`. The authorization code flow requires PKCE S256, checks the active admin role, binds the access token to the Better Auth session, and scopes it to the MCP resource. Default OAuth scopes are `authoring:read` and `authoring:stage`; supported explicit scopes include `authoring:review` and `authoring:withdraw`. Authenticated same-origin session connections receive all supported scopes. For clients without interactive OAuth support, an authenticated admin can call `/api/mcp/authoring/connection` to receive a per-session bearer token with a 30-day hard lifetime, bound to the live Better Auth session and active-admin role.

The endpoint exposes exactly two workflow choices, `idea_product` and `quiz_bank`; it does not expose a combined workflow or product-family selection. The quiz workflow exposes scoped Idea retrieval, accepts V2 question drafts with optional per-question Idea links, and writes canonical plus compatibility records as generated review items. `assessment.update_question` updates existing Zyx-original questions in the locked run scope and resets them to `reviewStatus=generated` for admin review (`authoring:stage`); ITB example questions are immutable and published or retired questions cannot be edited.

The MCP lifecycle surface provides inventory inspection, maintenance, and review tools:
- `authoring.list_imports` and `authoring.get_import` return staged bundle records, entity inventories, and review outcomes without exposing private storage keys or internal reviewer identity IDs (`authoring:read`).
- `authoring.restage_idea_bundle` and `authoring.restage_product_bundle` revalidate and replace staged bundles in place, resetting prior review decisions via existing lifecycle services (`authoring:stage`).
- `authoring.discard_product_draft` permanently deletes draft Product Bundles and their staging artifacts (`authoring:withdraw`). Published or withdrawn bundles cannot be discarded.
- `authoring.review_idea_bundle` and `authoring.review_product_bundle` record immutable review decisions (`approved` or `rejected`) with notes without publishing content (`authoring:review`).
- `authoring.withdraw_product_bundle` executes audited, idempotent, destructive withdrawal of published Product Bundles and retires canonical projections (`authoring:withdraw`). Idea Bundle withdrawal is not implemented.

Preserving the no-publication boundary: There is no `authoring:publish` scope and no publication tool. MCP submission can stage valid Idea and Product artifacts and generated questions, but no MCP tool can publish canonical content. Admin review and publication remain on the existing authenticated application boundary.

The current transport is stateless and does not require a database migration. OAuth authorization codes use the existing Better Auth verification store and are single-use. Signed access tokens have a 30-day hard lifetime, are derived from `BETTER_AUTH_SECRET`, carry the authenticated user and session identity, and are checked against the live session and active-admin role on every MCP request, becoming invalid earlier if the session expires or admin privileges change. The token is never permanent. Stored file keys encrypt their material and scope payload with AES-256-GCM and are also signed and limited to one hour. Short-lived workflow tokens carry the selected course, chapter, Source Pack checksum, and quality summary without exposing raw internal IDs. Canonical quality modules validate Source Pack originals and content, Idea coverage and duplicate candidates, and Product published-Idea scope, dependency freshness, and content density before staging. A later persistence phase can add run audit rows without changing the MCP tool contract.

## Plan 017 audit rework

The branch-local rework adds no table, migration, provider, or deployment requirement. The staging product-bundle rehearsal remains a separately approved process gate; canonical Idea, assessment, evidence, and Vectorize runtimes are always-on. The rework routes only approved Article, question, and solution products to canonical Vectorize namespaces, excludes holdout references, and appends per-Idea evidence only for exact published mappings. Rollback is branch-only during this phase; switching back to `staging` requires no data rollback.
