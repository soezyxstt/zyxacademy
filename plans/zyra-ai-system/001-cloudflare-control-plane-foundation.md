# Plan 001: Provision the staging Zyra control plane

> **Executor instructions**: Follow every step in order. Run each verification command and confirm its expected result. Stop on any STOP condition. Update this plan's row in `plans/zyra-ai-system/README.md` only after the evidence artifact validates.
>
> **Drift check**: `git diff --stat 03b68ba0..HEAD -- workers package.json lib/env.ts docs plans/zyra-ai-system`. If any planned path has changed, compare the current configuration to this plan before editing. A semantic conflict is a STOP condition.

## Status

- **Priority**: P0
- **Effort**: M
- **Risk**: MED
- **Depends on**: Idea-centered Overhaul Plan 002 complete
- **Category**: infrastructure
- **Planned at**: commit `03b68ba0`, 2026-08-02

## Why this matters

The current Gemini key scheduler is process-local, while staging runs across serverless instances. Quota reservations, cache single-flight, and key health require one strongly consistent coordination point. This plan creates only the authenticated Cloudflare control-plane foundation; later plans add quota and cache behavior.

## Current state

- `workers/realtime/wrangler.toml` already demonstrates a Durable Object Worker, but it uses the legacy migration form and is unrelated to Zyra.
- `workers/vector-api/wrangler.toml` currently binds staging to `zyx-vectors-staging`, a preserved 1024-dimension canonical-content index. Overhaul Plan 012 creates and cuts over to the separate `zyx-vectors-staging-v2` 768 index.
- Live inventory confirms `zyx-staging` KV and R2 exist. The existing R2 bucket must not be assumed private because its public access and historical object policy were not verified.
- No `workers/zyra-control-plane/` directory exists.
- Current Cloudflare documentation recommends `wrangler.jsonc` and declarative SQLite Durable Object exports for new namespaces.

Target resource names:

- Worker: `zyx-zyra-control-staging`
- Durable Object class: `ZyraQuotaCoordinator`
- KV binding: existing `zyx-staging`
- R2 binding: new private `zyx-zyra-private-staging`
- Vectorize semantic-cache index: `zyx-zyra-cache-staging`, 768 dimensions, cosine
- Analytics Engine dataset: `zyx_zyra_events_staging`

## Commands you will need

| Purpose | Command | Expected result |
|---|---|---|
| Identity | `wrangler whoami` | intended account, required permissions shown |
| Existing resources | `wrangler kv namespace list` | `zyx-staging` present |
| Existing resources | `wrangler r2 bucket list` | `zyx-staging` present |
| Create private bucket | `wrangler r2 bucket create zyx-zyra-private-staging` | bucket created once, no public domain configured |
| Apply retention | `wrangler r2 bucket lifecycle add zyx-zyra-private-staging zyra-attachments-7d zyx-attachments/ --expire-days 7` | staging attachments expire after 7 days |
| Existing resources | `wrangler vectorize list` | no conflicting 768 index or exact target is compatible |
| Create cache index | `wrangler vectorize create zyx-zyra-cache-staging --dimensions=768 --metric=cosine` | index created once |
| Types | `wrangler types --config workers/zyra-control-plane/wrangler.jsonc workers/zyra-control-plane/src/env.d.ts` | exit 0 |
| Dry run | `wrangler deploy --dry-run --env staging --config workers/zyra-control-plane/wrangler.jsonc` | exit 0, bindings resolved |
| Deploy | `wrangler deploy --env staging --config workers/zyra-control-plane/wrangler.jsonc` | staging Worker and SQLite DO reconciled |

Use the local Wrangler executable from `node_modules/.bin` if `wrangler` is not on PATH. Do not install or upgrade dependencies in this plan.

## Suggested executor toolkit

- Use the repository Cloudflare, Durable Objects, Workers best practices, and Wrangler skills if available.
- Retrieve current documentation before finalizing `exports`, Analytics Engine, Vectorize, or secret configuration.
- Use `node_modules/wrangler/config-schema.json` as the configuration schema.

## Scope

**In scope**:

- Create `workers/zyra-control-plane/wrangler.jsonc`.
- Create `workers/zyra-control-plane/src/index.ts`, `auth.ts`, `contracts.ts`, and `env.d.ts`.
- Create `workers/zyra-control-plane/tests/foundation.test.ts` using `bun:test` for pure auth and contract helpers.
- Create `scripts/staging/smoke-zyra-control-plane.ts` only if a root staging script is needed for the remote health gate.
- Update `.gitignore` only if the evidence directory or local Worker state is not already ignored.
- Update `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md`, `docs/DEVELOPMENT.md`, `docs/operations/production-readiness-checklist.md`, and `AGENTS.md` where the new service changes documented architecture.

**Out of scope**:

- Gemini calls, provider routing, quota policy, semantic lookup logic, and admin UI.
- Changes to `workers/realtime/**`.
- Changes to either canonical Vectorize index or its Worker. Overhaul Plan 012 owns creation and cutover of `zyx-vectors-staging-v2`; this plan owns only the semantic-cache index.
- Production resources.

## Git workflow

- Branch: `codex/zyra-ai-001-control-plane` from the integrated planning snapshot.
- Commit example: `feat(zyra): add staging control plane foundation`.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add a staging identity and resource preflight

Implement a read-only preflight that verifies Worker name, KV namespace title, private R2 bucket, Vectorize name and dimensions, and account fingerprint. Store only masked fingerprints in evidence. Reuse the staging guard conventions from `lib/staging/staging-guard.ts`; do not copy secrets into the Worker.

**Verify**: run the preflight with `.env.staging`; it exits 0 only for staging and refuses any production-like resource.

### Step 2: Define the Worker configuration

Use `wrangler.jsonc`. Declare separate staging bindings for the existing KV, dedicated private R2 attachment bucket, new 768 Vectorize index, and Analytics Engine. Declare `ZyraQuotaCoordinator` as a new SQLite-backed Durable Object with the current declarative `exports` form. Declare `ZYRA_CONTROL_PLANE_TOKEN` as a required secret name, never a plain `vars` value.

The Worker exposes only `GET /health` in this plan. It returns deployment version, binding presence booleans, and masked resource aliases. It must not return IDs, tokens, or arbitrary environment values.

**Verify**: `wrangler deploy --dry-run --env staging --config workers/zyra-control-plane/wrangler.jsonc` exits 0.

### Step 3: Implement authentication and safe errors

All routes except `/health` require a constant-time bearer-token comparison. `/health` remains non-sensitive. Unknown routes return a versioned JSON error. Error bodies never include stack traces, request headers, or binding values.

**Verify**: `bun test workers/zyra-control-plane/tests/foundation.test.ts` passes cases for missing, malformed, incorrect, and correct authorization plus safe 404 output.

### Step 4: Provision the semantic-cache index

Run the staging guard, list indexes, then create `zyx-zyra-cache-staging` only if absent. If it exists, require exactly 768 dimensions and cosine metric. Never delete or recreate an incompatible existing index automatically.

**Verify**: `wrangler vectorize get zyx-zyra-cache-staging` reports 768 and cosine.

### Step 5: Provision private attachment storage

Create `zyx-zyra-private-staging` only when absent. Do not configure `r2.dev`, a custom public domain, or any unauthenticated object route. Apply lifecycle rule `zyra-attachments-7d` to prefix `zyx-attachments/` with a 7-day expiration. If a bucket with the target name exists, verify it has no public access and that the lifecycle rule is compatible before binding it. Never reuse `zyx-staging` for learner uploads.

**Verify**: `wrangler r2 bucket list` contains the target, lifecycle inspection reports the exact prefix and expiration, and an unauthenticated public URL cannot be constructed from the configuration.

### Step 6: Configure the secret and deploy

The operator enters `ZYRA_CONTROL_PLANE_TOKEN` interactively with `wrangler secret put ZYRA_CONTROL_PLANE_TOKEN --env staging --config workers/zyra-control-plane/wrangler.jsonc`. Do not pass the value as a command argument and do not log it. Deploy the staging Worker and record the Durable Object reconciliation output without identifiers that should remain private.

**Verify**: authenticated and unauthenticated `/health` smoke cases return the documented status; the Analytics Engine dataset is allowed to remain absent until the first Plan 003 telemetry write.

### Step 7: Produce machine-generated evidence

Write `artifacts/zyra-ai/<runId>/plan-001-result.json` with source commit, masked account fingerprint, resource aliases, dimensions, metric, command exit codes, Worker version, and health results.

**Verify**: a schema validator exits 0 and the artifact contains no secret variable values.

## Test plan

- Auth comparison and missing-secret fail-closed behavior.
- Safe health payload and safe error serialization.
- Resource-contract validation for correct and incorrect Vectorize dimensions.
- Idempotent preflight when the target resources already exist.
- Private R2 access, lifecycle prefix, and retention validation.
- Staging guard rejection for production-like aliases.

## Done criteria

- [ ] New 768-dimension semantic-cache index exists and both canonical indexes remain under Overhaul Plan 012 ownership.
- [ ] Staging Worker and SQLite Durable Object namespace deploy successfully.
- [ ] Existing staging KV is bound and unchanged.
- [ ] `zyx-zyra-private-staging` exists without public access and expires `zyx-attachments/` after 7 days.
- [ ] Analytics Engine binding is present.
- [ ] `bun test workers/zyra-control-plane/tests/foundation.test.ts` passes.
- [ ] `bun run lint`, `bun run typecheck`, and `git diff --check` exit 0.
- [ ] Plan 001 evidence validates and contains no secret values.

## STOP conditions

- Wrangler account differs from the approved staging account.
- `zyx-zyra-cache-staging` exists with a dimension other than 768 or a metric other than cosine.
- The target private bucket has public access enabled or an incompatible lifecycle rule.
- Deployment proposes changing or deleting an existing Durable Object namespace.
- The required secret is unavailable.
- Any command targets production.
- Implementation requires editing `workers/realtime/**` or the canonical Vectorize index.

## Rollback and maintenance

Disable callers first. A Worker rollback may restore the previous code version, but do not delete the Durable Object namespace, cache index, or attachment bucket because later reconciliation may need their evidence. Preserve private objects until the 7-day staging lifecycle removes them. Analytics Engine is telemetry only. Review Cloudflare documentation before changing `exports`, because Durable Object lifecycle changes are not ordinary code rollbacks.
