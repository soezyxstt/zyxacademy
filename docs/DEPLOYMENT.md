# Deployment Guide

## Proposed Cloud Run staging setup

The [Cloud Run staging runbook](operations/cloud-run-staging.md) is `OPEN / IN PROGRESS` for project `zyx-academy` in Taiwan (`asia-east1`). It covers the proposed request-based, scale-to-zero configuration, cost limits, container prerequisites, secrets, OAuth/origin checks, and scheduler migration. No Cloud Run deployment is verified yet.

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

The central `.github/workflows/ci.yml` planner calls the reusable deployment
workflow only for worker dependencies or V4 fingerprint inputs on push, after
selected checks pass. Direct manual `workflow_dispatch` remains available on
`main` and `staging`. For a V4-only release, worker import/typecheck/asset checks
are skipped because the worker import graph is unchanged; its build identity is
still regenerated and deployed. A worker-code release retains those checks.
Push impact is measured from the last successful CI release, so replacing a
pending run does not lose its worker changes. The gate rejects a superseded
branch head before deployment. See [CI scope and incremental checks](DEVELOPMENT.md#ci-scope-and-incremental-checks).
The deployment workflow performs the following actions:
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

V4 verification uses the existing Deno Deploy worker with Cloudflare Browser Run (default) or Steel over CDP. Sync `BETTER_AUTH_SECRET`, `CF_API_TOKEN`, `CF_ACCOUNT_ID` and `NEXT_PUBLIC_APP_URL` from the exact GitHub environment. The browser token needs Browser Rendering Edit permission. Set GitHub environment variable `AUTHORING_VERIFICATION_BROWSER_PROVIDER=steel`, environment secret `STEEL_API_KEY`, and environment variable `AUTHORING_VERIFICATION_STEEL_BROWSER_VERSION` to the exact reviewed version from a probe. Mirror the two non-secret variables in the web deployment environment so web and worker derive the same plan. The Deno deploy workflow syncs these settings and the key; the operations workflow reads the same provider/version. Cloudflare credentials stay compatible. Each new plan pins provider and deployed browser version; drift or an older plan without provider identity fails closed until reviewed and released. Switching provider changes plan hashes and requires a new attempt, receipt and PDF evidence. Inspect and cancel the exact existing native run before retrying the revision. The Deno workflow regenerates the V4 build identity before uploading it with the worker. Source crops pin the same PDF.js and native canvas versions in both Deno import maps. The local Node verification adapter is a test utility, not another hosting requirement.

The read-only `/v4` page presents a version-specific Article preview and its inspected static Diktat PDF. It does not convert or publish existing course content. Existing Articles adopt V4 through an explicitly authored and reviewed V4 bundle.

### Web builds in GitHub Actions

The central CI planner calls `.github/workflows/deploy-web.yml` only for web
inputs on push, after the selected checks pass. The reusable workflow also keeps
manual dispatch and retains the production Vercel prebuilt job for
`main`. Its `staging-image` job builds branch `staging` with Node 24 and Bun 1.3.14,
then packages the standalone output in `Dockerfile.cloud-run`, smoke tests it,
and pushes an immutable commit-tagged image to
`asia-east1-docker.pkg.dev/zyx-academy/zyx-staging/zyx-academy`.
Cloud Build is not used. The same staging job deploys that digest to `zyx-academy` in Taiwan,
waits for the new revision to be ready without traffic, verifies the revision's
image, then directs 100 percent of staging traffic to it. The workflow synchronizes application runtime values from GitHub Environment
`staging` and preserves unmanaged settings, remaining Secret Manager references,
and invocation IAM. It does not
change DNS. The CI summary records the image, revision, URL and previous traffic
for rollback.

| Git branch | GitHub Environment | Build and destination |
| --- | --- | --- |
| `staging` | `staging` | Build, push to Taiwan Artifact Registry, automatically deploy Cloud Run staging |
| `main` | `production` | Vercel Production, `www.zyxacademy.com` |

Production uses the existing Vercel project `zyxacademy`
(`prj_9wDdc36VFIH5wJT45jEXIHGst2pb`) in team
`team_rMFT8hSTCTObKzXirjJcbMFc`. Keep `VERCEL_TOKEN` and production app variables
in their existing places. Production still runs `vercel pull`, `vercel build`
and `vercel deploy --prebuilt` with CLI 65.2.0. The existing Deno worker retains
its separate `.github/workflows/deploy.yml` pipeline.

Before enabling staging CI/CD, follow the
[Console setup runbook](operations/cloud-run-staging.md). Use one service
account for CI and runtime. Grant it Artifact Registry Writer, Cloud Run Developer
and Service Account User through project IAM. Existing project-level grants
cover the project resources; repository-level grants are not additionally
required. If the service references Secret Manager, this same account needs
access to its staging secrets. Store the complete CI service-account JSON key in
GitHub Environment `staging` as Secret `GCP_SERVICE_ACCOUNT_KEY`. The workflow
validates the key type and project without printing it and authenticates only
after packaging and testing the image. It does not use OIDC, a Workload Identity
provider, or a Cloud Build trigger. Keep `NEXT_PUBLIC_APP_URL` as a staging
Environment Variable or the existing matching Secret.

Staging builds receive explicitly listed public browser settings from GitHub
Variables or Secrets, the non-secret V4 browser provider/version, and the existing
staging Turso URL/token. Sitemap generation reads published blog metadata at
build time. The build rejects any database hostname other than the allowlisted
staging Turso host. Configure `TURSO_DATABASE_URL`, `TURSO_CONNECTION_URL`, or
`DATABASE_URL`, plus `TURSO_AUTH_TOKEN`, in GitHub Environment `staging`; prefer a
read-only database token for builds. These credentials are process environment
values, not image build arguments, copied files, or image environment settings.
Set `NEXT_PUBLIC_APP_URL` to the chosen staging origin and mirror the existing
public integration settings. Empty optional public settings are unset so app
defaults apply. The deployment step passes the staging Secrets/Variables to a
strict application-runtime allowlist in `.github/scripts/cloud_run_runtime.py`.
It writes a mode-0600 temporary environment file after image publication and
supplies it to `gcloud run deploy`. GitHub application credentials become runtime
environment values in Cloud Run; they are not included in Docker image layers.
CI-only keys/tokens are excluded. Existing unmanaged settings and Secret Manager
references are preserved unless explicitly replaced by GitHub values. All three
Turso URL aliases are synchronized to the verified staging endpoint, preventing
an old local URL from taking precedence. Temporary files are deleted on exit. Only the isolated build process uses
`SKIP_ENV_VALIDATION=1`; the final image leaves runtime validation enabled.

Both builds run the complete `bun run build`, including authoring skills and V4
runtime preparation. Only the staging build sets `NEXT_OUTPUT=standalone`.
The Docker context allowlist accepts the traced runtime, static assets, and
`public`; environment files, local databases, keys, and generated Google
credentials are excluded. No application compilation runs during the Docker
packaging step or in Cloud Run. The staging image uses an unprivileged Node user.
The workflow validates native canvas, PDF/KaTeX assets, authoring skills, and
HTTP static serving with a 1 GiB memory limit before authenticating and pushing.
This smoke check does not establish database, OAuth, SSR load, or remote success.

The one-time service bootstrap remains in Console for the service identity and
invocation policy. Application variables do not need to be manually entered there:
CI synchronizes them from GitHub before deploying the next revision. If the
service is absent, CI publishes the image but refuses to create an unconfigured
app; use that image for initial setup and rerun. Subsequent pushes build, push and
deploy automatically. The deployment script rejects a wrong project/service,
an explicit non-staging marker, a non-staging database/origin, or missing required
runtime settings. Missing staging markers and origins are repaired from the
reviewed GitHub staging settings. Build-only validation bypass is removed from
the runtime configuration. A failed/unready
revision or a digest mismatch prevents the traffic update. Editor and Owner are not required. The single account needs secret-value
access when its Cloud Run runtime reads Secret Manager references.

Restrict GitHub Environment `staging` to branch `staging` and `production` to
`main`. Workflow jobs also enforce those branch identities; PRs do not publish
images or receive deployment credentials. Releases remain serialized by branch.
`vercel.json` continues to disable automatic Vercel Git deployments, preventing a
duplicate remote build. Existing staging Vercel revisions remain available, but
this workflow no longer updates them once the change reaches `staging`. Do not
remove the old deployment or move DNS until Cloud Run acceptance and rollback
checks pass. See the runbook for runtime secrets, cron, cost, OAuth, and origin
checks before cutover.

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

## Bilingual locale deployment boundary

The app source includes the additive Drizzle migration `0098_workable_blue_blade.sql`, which creates `account_locale_preferences` with an `id`/`en` constraint. A guarded preflight passed for the allowlisted staging database host `zyx-staging-soezyxstt.aws-ap-south-1.turso.io` (non-secret fingerprint `f8efc727c7a49567`). A proxy-enabled, read-only SQLite schema and Drizzle-ledger query exited 0 and found neither the `0098` migration-ledger entry nor the preference table. Migration 0098 is pending on that staging target. No rows were read and no staging or production write was performed. The environment's `.env.staging` and `.env.prod` files were absent, so there was no direct environment-file comparison; full evidence is in `artifacts/bilingual/staging-preflight-locale-0098.json`. Before any remote migration, recheck the exact target, use the guarded backup and verification runner, and obtain authorization. Rollback keeps the additive preference table and rows; an older application build can ignore them. Do not rewrite academic records or notification history as part of locale rollout.

Public `/id/...` and `/en/...` routes are limited to the source allowlist and use same-origin Proxy rewrites with `skipProxyUrlNormalize`. A local production-build matrix covered 13 public paths, both locales, and mobile/laptop viewports: 52 captures returned HTTP 200, matching `html lang`, canonical URL, no runtime or HTTP failures, and no overflow; the primary agent inspected each capture. Populated demo states and blog article slugs were unavailable, and request-time cache behavior was not measured. The focused Playwright suite passed 20 cases and skipped 2; a separate boundary run passed 4 and skipped 2 unavailable PKA fixtures. The primary reviewer accepted 26 focused state screenshots, including 4 new MCP screenshots after the invalid-authorization shell was localized. Together with the public matrix, the accepted SHA-256 manifest contains 78 captures at `artifacts/visual-quality/bilingual-final-boundaries/accepted-capture-manifest.json`. Eight metadata browser checks passed at mobile and laptop sizes for sign-out, the localized web manifest, and representative academic/evaluation routes; these checks establish metadata behavior only. The early loading-overlay capture is handled by reduced-motion emulation in the test setup. The final release candidate build and static gates passed. The 307-route state matrix remains incomplete. The bilingual plan is still partial at CP7; no CP8 rollout is authorized or recorded here.

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

When enabling the endpoint, no MCP-specific static token or actor ID is configured. MCP authorization uses the existing Better Auth session through `/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`, `/api/mcp/oauth/register`, `/api/mcp/oauth/authorize`, and `/api/mcp/oauth/token`. The authorization code flow requires PKCE S256, checks the active admin role, binds the access token to the Better Auth session, and scopes it to the MCP resource. OAuth defaults include all four scopes: `authoring:read`, `authoring:stage`, `authoring:review`, and `authoring:withdraw`. The consent page always shows all four supported scopes. Client-requested scopes are checked initially; other supported scopes remain unchecked until explicitly selected. At least one selection is required, and only selected supported scopes are granted. Existing tokens require reauthorization to gain additional scopes. Authenticated same-origin session connections receive all supported scopes. For clients without interactive OAuth support, an authenticated admin can call `/api/mcp/authoring/connection` to receive a per-session bearer token with a 30-day hard lifetime, bound to the live Better Auth session and active-admin role.

The endpoint exposes three workflow choices: `idea_product`, `quiz_bank`, and `reference_question_ingest`; it does not expose a combined workflow or product-family selection. Clients bootstrap via `workflow.get_playbook`, which serves canonical stage instructions from `lib/authoring/playbooks/` (bundled into the route trace via `outputFileTracingIncludes` in `next.config.ts`) and issues a short-lived signed `bootstrapToken`. The `quiz_bank` workflow exposes scoped Idea retrieval, accepts V2 question drafts with optional per-question Idea links, and stages Zyx-original questions for review (`reviewRequired=true`). `assessment.update_question` updates existing draft Zyx-original questions in the locked run scope and resets them to `reviewStatus=generated` for admin review (`authoring:stage`); ITB example and historical reference questions are immutable and published or retired questions cannot be edited. The `reference_question_ingest` workflow runs at course scope and writes immutable historical reference questions directly with `status=published` (`reviewRequired=false`, `publicationTarget=reference_question_bank`).

The MCP lifecycle surface provides inventory inspection, maintenance, and review tools:
- `authoring.list_imports` and `authoring.get_import` return staged bundle records, entity inventories, and review outcomes without exposing private storage keys or internal reviewer identity IDs (`authoring:read`).
- `authoring.restage_idea_bundle` and `authoring.restage_product_bundle` revalidate and replace staged bundles in place, resetting prior review decisions via existing lifecycle services (`authoring:stage`).
- `authoring.discard_product_draft` permanently deletes draft Product Bundles and their staging artifacts (`authoring:withdraw`). Published or withdrawn bundles cannot be discarded.
- `authoring.review_idea_bundle` and `authoring.review_product_bundle` record immutable review decisions (`approved` or `rejected`) with notes without publishing content (`authoring:review`).
- `authoring.withdraw_product_bundle` executes audited, idempotent, destructive withdrawal of published Product Bundles and retires canonical projections (`authoring:withdraw`). Idea Bundle withdrawal is available only in the authenticated admin review UI and is not exposed through MCP.

Publication boundaries per workflow: Idea Bundles and Product Bundles never publish through MCP; their canonical publication remains on the authenticated admin review UI boundary. `quiz_bank` stages Zyx-original questions for review, `reference_question_ingest` publishes historical reference questions directly to `reference_question_bank` (`quizEligible=true` items are immediately usable in quizzes), and `quiz.create`/`quiz.update` set quiz metadata status (`draft` or `published`).

The current transport is stateless and does not require a database migration. OAuth authorization codes use the existing Better Auth verification store and are single-use. Signed access tokens have a 30-day hard lifetime, are derived from `BETTER_AUTH_SECRET`, carry the authenticated user and session identity, and are checked against the live session and active-admin role on every MCP request, becoming invalid earlier if the session expires or admin privileges change. The token is never permanent. Stored file keys encrypt their material and scope payload with AES-256-GCM and are also signed and limited to one hour. Short-lived workflow tokens carry the selected course, chapter, Source Pack checksum, and quality summary without exposing raw internal IDs. Canonical quality modules validate Source Pack originals and content, Idea coverage and duplicate candidates, and Product published-Idea scope, dependency freshness, and content density before staging. A later persistence phase can add run audit rows without changing the MCP tool contract.

## Plan 017 audit rework

The branch-local rework adds no table, migration, provider, or deployment requirement. The staging product-bundle rehearsal remains a separately approved process gate; canonical Idea, assessment, evidence, and Vectorize runtimes are always-on. The rework routes only approved Article, question, and solution products to canonical Vectorize namespaces, excludes holdout references, and appends per-Idea evidence only for exact published mappings. Rollback is branch-only during this phase; switching back to `staging` requires no data rollback.

Plugin release order: merge and verify the server deployment first, including `workflow.get_playbook` asset loading and legacy-client compatibility. Push and PR events in `sync-plugin.yml` validate both packages only. After server verification, dispatch `sync-plugin.yml` on `staging` with `target_env=staging`, then on `main` with `target_env=production` after the production server passes the same checks. This explicit mirror step prevents thin skills from reaching clients before their bootstrap tool is available.

### MCP PDF job rollout

The always-on PDF page reader requires `source-read-page` in the Deno compute app's Inngest function registration before enabling the updated web endpoint. Use the existing environment-specific deployment and Inngest sync path. Verify a cold text read returns a job ID, polling completes with text and no image, an image request honors the requested width, and a failed page retries without rerendering completed pages. Verify a signed download with `Range: bytes=0-1023` returns HTTP 206, Content-Range, and ETag; then exercise interruption/resume with the repository client. Local fixture tests do not prove these remote boundaries. No database migration or feature flag is introduced. Job and cache objects remain private in the existing environment's R2 bucket.

## Python coding deployment

Staging interactive Playground and runnable Article examples require
`PYTHON_RUNTIME_TOKEN_SECRET` in GitHub Environment `staging`, matching the
Render Python worker. The staging runtime allowlist forwards it to Cloud Run.
The ticket endpoint checks course access and returns a short-lived WebSocket
ticket; the key never reaches the browser. The worker and Daytona sandbox must
already be available. This does not change Submit grading or production Run.

Python coding requires the generated coding table migration and a paired release
of the Next application and `workers/realtime` for graded Live Quiz. Production
Submit requires working Cloudflare Browser Run credentials through existing
`CF_ACCOUNT_ID` and `CF_API_TOKEN` by default. `CODING_BROWSER_PROVIDER=steel`
selects the shared Steel session adapter using server-only `STEEL_API_KEY`.
This is independent of V4 verification settings. Real Steel Python grading has
passed against the local app with synthetic SQLite data. This does not certify
a deployed rollout or the deployment environment's CDP transport. Local Chromium is rejected in production. Neither provider
falls back automatically, and provider release failures remain ungradable.
Runtime package assets and Worker/frame files
are included in Next output tracing. See [coding contract](coding-foundation.md).
Local implementation/testing does not establish remote rollout or credentials.
