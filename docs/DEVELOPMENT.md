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
| `bun --env-file=.env.staging run staging:test-authoring-context -- --run-id <runId> --course tutorial-pka` | Export and round-trip one protected authoring context pack |
| `bun --env-file=.env.staging run staging:scan-context-pack -- --run-id <runId>` | Rebuild and scan the Plan 007 context projection |
| `bun --env-file=.env.staging run staging:test-product-bundle -- --run-id <runId> --fixture all` | Validate, stage, publish, and rollback-test all Product Bundle V2 types |
| `bun --env-file=.env.staging run staging:reconcile-bundle -- --run-id <runId> --type product` | Independently reconcile the Plan 008 product publication |
| `bun --env-file=.env.staging run vectorize:prepare-index -- --run-id <runId> --env staging` | Validate the 768-dimensional canonical staging index and metadata indexes |
| `bun --env-file=.env.staging run vectorize:backfill -- --run-id <runId> --source db --resume` | Rebuild canonical vectors from Turso through the fixed Gemini Embedding 2 profile |
| `bun --env-file=.env.staging run vectorize:reconcile -- --run-id <runId> --exact` | Compare the Turso manifest and canonical Vectorize IDs and metadata |
| `bun --env-file=.env.staging run vectorize:golden -- --run-id <runId> --course <courseId>` | Run canonical retrieval and restricted-solution capability checks |
| `bun --env-file=.env.staging run staging:smoke-zyra -- --run-id <runId> --course <courseId> --suite canonical` | Run the approved-content Zyra smoke suite |
| `bun --env-file=.env.staging run staging:scan-zyra-privacy -- --run-id <runId>` | Reconcile Zyra cache and active-attempt privacy artifacts |
| `bun --env-file=.env.staging run staging:e2e-admin-tutor -- --run-id <runId> --course <courseId>` | Exercise the guarded admin and tutor workflow fixture |
| `bun --env-file=.env.staging run staging:e2e-murid -- --run-id <runId> --course <courseId> --account dedicated` | Exercise the dedicated murid read-model smoke |
| `bun --env-file=.env.staging run staging:full-rehearsal -- --run-id <runId> --plan-012-run-id <runId> --plan-013-run-id <runId> --plan-014-run-id <runId> --plan-015-run-id <runId> --with-rollback` | Rehearse canonical enable, full rollback, and re-enable after all predecessor result artifacts pass |
| `bun --env-file=.env.staging run staging:legacy-caller-inventory -- --run-id <runId> --fail-on-write` | Inventory remaining legacy provider matches and fail on active writers |
| `bun --env-file=.env.staging run staging:decommission-pinecone -- --dry-run --not-provisioned` | Record the exact deterministic absence fingerprint when staging never provisioned a legacy Pinecone index |
| `bun --env-file=.env.staging run staging:finalize-cutover -- --run-id <runId> --run-a <runId> --run-b <runId> --plan-012-run-id <runId> --plan-013-run-id <runId> --plan-014-run-id <runId> --plan-015-run-id <runId> --inventory-run-id <runId> --decommission-run-id <runId>` | Generate the staging-only Plan 016 go or no-go dossier after both rehearsals, zero runtime legacy callers, and confirmed decommission |

Canonical vector IDs preserve the database entity identity in metadata. IDs containing `:` use the shared URI-encoded vector-ID segment and are decoded before Turso hydration. If a Gemini rate limit interrupts `vectorize:backfill`, rerun the same `--run-id` with `--resume`; the artifact checkpoint prevents already processed vector IDs from being embedded or upserted again. Do not switch models or use a 1024-dimensional fallback.

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

### Optional ; Canonical Vectorize
- `VECTORIZE_WORKER_URL`, `VECTORIZE_SHARED_SECRET` ; authenticated canonical Vectorize worker
- `RESTRICTED_SOLUTION_CAPABILITY` ; staging Worker capability required for published solution retrieval
- `FEATURE_VECTORIZE_ONLY_V1` ; canonical 768-dimensional retrieval and outbox writes
- `FEATURE_ZYRA_IDEA_RUNTIME_V1` ; canonical Zyra hydration and assessment safety
- `FEATURE_ADMIN_TUTOR_WORKFLOW_V1` ; admin and tutor content lifecycle
- `FEATURE_MURID_IDEA_WORKFLOW_V1` ; murid Idea read model and compatibility adapters

### Optional ; Production Services
- `DIKTAT_RENDERER_URL`, `DIKTAT_RENDERER_SECRET` ; Puppeteer PDF service
- `NEXT_PUBLIC_REALTIME_URL`, `LIVE_HMAC_SECRET` ; Live quiz Worker
- `WHATSAPP_ADMIN_NUMBER` ; Admin WhatsApp notifications
- `SENTRY_*` ; Error tracking

### Staging overhaul guard

Remote staging commands must load `.env.staging`, set `ZYX_ENVIRONMENT=staging`, and set `ALLOW_STAGING_MUTATION=1` only for an explicitly reviewed write. `STAGING_EXPORT_KEY` is supplied outside Git and is required for keyed manifests and encrypted exports. Production counterparts are compared before a staging command can continue. Do not use `db:sync-prod-to-staging`; its replacement is the separately named destructive command `db:sync-prod-to-staging:destructive`, which also requires the explicit confirmation phrase.

Plan 006 staging workflow commands are:

```bash
bun --env-file=.env.staging run staging:preflight
bun --env-file=.env.staging run staging:test-idea-bundle -- --run-id <runId> --fixture all
bun --env-file=.env.staging run staging:reconcile-bundle -- --run-id <runId> --type idea
```

The staging test uses the authenticated Wrangler R2 adapter only for the test process when the staging script enables `STAGING_BUNDLE_WRANGLER_STORAGE=1`; production runtime storage remains the normal R2 provider.

`FEATURE_ASESMEN_IDE_V1`: stable option IDs, chapter-scoped assessment metadata, deterministic blueprint selection, and Plan 010 evidence and benchmark contracts. Absent or `0` keeps the legacy quiz path visible and authoritative.

`FEATURE_PEMAHAMAN_IDE_V1`: append-only per-Idea evidence writers, deterministic mastery and confidence, compatibility reads, and flashcard recommendation priorities with suppression for mastery scores of 80 or higher. Absent or `0` keeps the additive learning loop invisible. It never enables an AI call.

Plan 010 local checks:

```bash
bun run lint
bun test tests/contracts/question-pipeline.test.ts tests/contracts/assessment-redaction.test.ts tests/contracts/assessment-blueprint-v2.test.ts tests/contracts/idea-evidence.test.ts tests/contracts/benchmark-holdout.test.ts
bun run typecheck
git diff --check
```

The staging-only assessment scripts are `staging:smoke-assessment-v2` and `staging:scan-assessment-leaks`. They require `.env.staging` and must not be run without explicit staging write authorization. The smoke keeps the requested course ID in its artifact; when that course has fewer than two published canonical Ideas, it deterministically selects the first canonical `mataKuliah` with at least two published Ideas, records `normalizedCourseId`, `fixtureMode`, `fallbackReason`, and `requestedNormalizedMismatch`, and writes fixture rows only to that resolved course. It fails closed when no fallback exists.

Plan 011 local and staging checks are:

```bash
bun run lint
bun test tests/contracts/idea-mastery-engine.test.ts tests/contracts/mastery-idempotency.test.ts tests/contracts/flashcard-generator.test.ts tests/migration/mastery-compatibility.test.ts
bun run typecheck
bun --env-file=.env.staging run staging:preflight
bun --env-file=.env.staging run staging:shadow-idea-mastery -- --run-id <runId> --course tutorial-pka
bun --env-file=.env.staging run staging:recompute-idea-mastery -- --run-id <runId> --course tutorial-pka --mode full
bun --env-file=.env.staging run staging:recompute-idea-mastery -- --run-id <runId> --course tutorial-pka --mode incremental --expect-noop
git diff --check
```

Plan 017 branch-local checks are intentionally read-only with respect to remote resources. Do not run database migrations, Vectorize backfills, R2 cleanup, deployment, or staging rehearsal from this branch without separate approval. The local contract gate is:

```bash
bun test tests/contracts/product-bundle-v2.test.ts tests/contracts/material-pipeline.test.ts tests/contracts/flashcard-generator.test.ts tests/contracts/vector-outbox.test.ts tests/contracts/vectorize-contract.test.ts tests/contracts/assessment-domain.test.ts tests/contracts/idea-evidence.test.ts tests/contracts/idea-mastery-domain.test.ts tests/contracts/mastery-idempotency.test.ts tests/contracts/live-idea-evidence.test.ts
bun run lint
bun run typecheck
git diff --check
```

The live compatibility bridge uses the existing `FEATURE_ARSITEKTUR_IDE_V1`, `FEATURE_DUAL_WRITE_IDE`, `FEATURE_ASESMEN_IDE_V1`, and `FEATURE_PEMAHAMAN_IDE_V1` flags together. Keep any missing flag at `0` to preserve the legacy-only path.

## Feature Flags

All gated by `FEATURE_*` env vars. Absent or `"0"` = hidden/disabled.

`FEATURE_PERAN_V2` must remain absent or `0` until the Plan 002 identity backfill, parity checks, and active-session auth smoke all pass. The legacy `user.role` column remains a compatibility projection during this phase.

`FEATURE_ARSITEKTUR_IDE_V1` remains absent or `0` after Plan 003. The schema and contracts are additive; no existing KO or source caller switches to `ide` until a later predecessor-gated plan.

Plan 004 adds three disabled target-domain flags. They remain absent or `0` in staging until later plans prove mapping and runtime parity:

* `FEATURE_PRODUK_IDE_V1`: normalized article, material, question, solution, and flashcard domain.
* `FEATURE_ASESMEN_IDE_V1`: normalized assessment definition, attempt, answer, and snapshot domain.
* `FEATURE_PEMAHAMAN_IDE_V1`: Idea-level evidence, mastery, history, and recommendation domain.
* `FEATURE_IDEA_BUNDLE_V2`: strict ZIP-based Idea import, review, and atomic publication.
* `FEATURE_AUTHORING_CONTEXT_V1`: deterministic redacted Authoring Context Pack export.
* `FEATURE_PRODUCT_BUNDLE_V2`: typed Product Bundle upload, preview, review, and atomic publication.

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
| `FEATURE_PRODUK_IDE_V1` | Normalized product and Idea link domain |
| `FEATURE_ASESMEN_IDE_V1` | Normalized assessment and historical snapshot domain |
| `FEATURE_PEMAHAMAN_IDE_V1` | Idea evidence and mastery domain |
| `FEATURE_IDEA_BUNDLE_V2` | Strict ZIP Idea Bundle upload, review, and publication |
| `FEATURE_AUTHORING_CONTEXT_V1` | Deterministic redacted authoring context export |
| `FEATURE_PRODUCT_BUNDLE_V2` | Typed product bundle workflow and atomic publication |
| `FEATURE_VECTORIZE_ONLY_V1` | Canonical 768-dimensional Vectorize-only indexing and retrieval |
| `FEATURE_ZYRA_IDEA_RUNTIME_V1` | Course-scoped Zyra retrieval and approved-content hydration |
| `FEATURE_ADMIN_TUTOR_WORKFLOW_V1` | Admin and tutor content lifecycle with mutation audit |
| `FEATURE_MURID_IDEA_WORKFLOW_V1` | Murid Idea-centered read model and Tutorial PKA adapters |
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

