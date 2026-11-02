# Development Guide

Staging now uses the guarded Neon PostgreSQL target, and `bun run db:migrate` applies `drizzle-postgres/`. The legacy production push and canonical backfill are disabled here. Staging storage uses its private Neon S3-compatible bucket with `STORAGE_PROVIDER_MODE=neon`. Use [.env.neon.example](../.env.neon.example) and the [migration runbook](operations/neon-migration.md); do not reuse production sessions or integration credentials. Other SQLite and R2 instructions below describe legacy or production deployments unless noted.

The staging importer can consume a signed local source snapshot using `NEON_SOURCE_SNAPSHOT` and `NEON_SOURCE_FREEZE_ACK=staging-writes-frozen`. The snapshot exporter requires the dedicated ignored `.env.neon-staging-cutover-source` file and independently verified staging write freeze. Snapshots and their manifests stay under ignored `.tmp`, with local access restricted to the operator. They contain business data and must not enter CI uploads. `scripts/neon/source-snapshot.test.ts` exercises only synthetic data.

The serving staging target uses ignored `.env.neon-staging-cutover`; guarded source and import settings use `.env.neon-staging-cutover-source`. The earlier `.env.neon-staging` and `.env.neon-staging-source` refer to the separate preparation target. Do not substitute the production rehearsal environment. Apply generated migrations only to an independently verified target, and reconcile a frozen source before importing. The copy tool accepts only the exact rehearsal and staging host/bucket pairs. Use forward slashes in Windows snapshot paths stored in dotenv files. Never upload environment files or real snapshots in deployment source archives.

## Quick Start

This migration branch pins Bun 1.3.14 in `package.json`, matching its Vercel build. `bun run test:ai-contracts` runs every contract file sequentially in a fresh process with placeholder credentials. PostgreSQL fixtures use PGlite with the generated migrations, native constraints and shared numeric parsers. Install Playwright Chromium and run `bun run build:authoring-skills` before the complete suite. Use the sandbox router for heavy installs, suites and typechecks; upload only reviewed source and synthetic fixtures.

```bash
bun install
cp .env.example .env.local  # fill in secrets
bun run dev                  # http://localhost:3000
```

## Cloud Run staging build

The existing `.github/workflows/deploy-web.yml` builds `staging` as a standalone
Node runtime image for Taiwan Artifact Registry. Only that build sets
`NEXT_OUTPUT=standalone`; the production Vercel build retains its existing mode.
`Dockerfile.cloud-run` expects an already completed `bun run build`; it does not
compile the application. GitHub Environment `staging` supplies the public build
settings, V4 browser identity, and the `GCP_SERVICE_ACCOUNT_KEY` JSON Secret. The account email is read from that key
and used for both CI and the Cloud Run runtime. Application runtime credentials are synchronized from GitHub staging Secrets
and Variables during deployment, using the explicit runtime allowlist and a
private temporary environment file. They are not embedded in the image. Existing
unmanaged settings and unreplaced Secret Manager references remain available. Follow the
[Cloud Run staging runbook](operations/cloud-run-staging.md) before running the
workflow or changing the staging origin. After one-time service/secret setup, each staging push deploys the exact
published digest and switches traffic only after readiness checks. Cloud Build
is not used.

## Available Commands

| Command | Purpose |
|---------|---------|
| `bun run dev` | Start dev server (Turbo mode) |
| `bun run build` | Production build |
| `bun run start` | Start production server |
| `bun run lint` | Run ESLint |
| `bun run typecheck` | bunx tsc --noEmit |
| `bun run typecheck:structured-articles` | Type check the structured Article contracts and compiler core only |
| `bun run test` | Run all Bun test suites |
| `bun run test:ai-contracts` | Run deterministic AI contract tests (`tests/contracts`) |
| `bun run db:generate` | Generate Drizzle migration from schema changes |
| `bun run db:migrate` | Apply PostgreSQL migrations to the guarded isolated Neon target on this branch |
| `bun run db:push:prod` | Safe production migration (backup + verify) |
| `bun run db:seed` | Seed local DB with test data |
| `bun run structured-articles:inventory` | Dry run legacy Article structure classification |
| `ALLOW_STRUCTURED_ARTICLE_RECONCILE=1 bun run structured-articles:reconcile` | Apply deterministic nonproduction Article conversion and review target backfill |
| `bun --env-file=.env.staging run staging:preflight` | Fail-closed staging identity check |
| `bun --env-file=.env.staging run staging:zyra-control:preflight -- --run-id <runId>` | Validate Plan 001 staging identity, resource aliases, and protected 768 cache policy |
| `bun --env-file=.env.staging run staging:zyra-control:smoke -- --run-id <runId> --url <stagingWorkerUrl> --worker-version <versionId>` | Run safe public health and unauthorized-route smoke and write Plan 001 evidence |
| `bun --env-file=.env.staging run staging:probe-gemini-models -- --mock --run-id <runId>` | Run the zero-network Plan 002 adapter probe |
| `bun --env-file=.env.staging run staging:probe-gemini-models -- --real --max-requests 40 --run-id <runId>` | Run the bounded staging provider matrix with masked evidence |
| `bun --env-file=.env.staging scripts/staging/smoke-zyra-quota.ts --local --synthetic-concurrency 100 --run-id <runId>` | Run the zero-network Plan 003 quota smoke and write local evidence |
| `bun --env-file=.env.staging scripts/staging/smoke-zyra-quota.ts --url <stagingWorkerUrl> --synthetic-concurrency 100 --run-id <runId>` | Run the staging-only synthetic quota smoke after explicit Worker deployment approval |
| `bun --env-file=.env.staging scripts/staging/manifest-ai-usage.ts --phase before --run-id <runId>` | Write a read-only masked Plan 004 legacy usage manifest |
| `bun --env-file=.env.staging scripts/staging/reconcile-ai-usage.ts --run-id <runId> --strict` | Reconcile allowance leases, compatibility events, and before/after legacy manifests |
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
| `bun test tests/contracts/authoring-mcp.test.ts` | Run provider-neutral MCP workflow and Source Pack boundary contracts |
| `bun --env-file=.env.staging run staging:reconcile-bundle -- --run-id <runId> --type product` | Independently reconcile the Plan 008 product publication |
| `bun --env-file=.env.staging run vectorize:prepare-index -- --run-id <runId> --env staging` | Validate the 768-dimensional canonical staging index and metadata indexes |
| `bun --env-file=.env.staging run vectorize:backfill -- --run-id <runId> --source db --resume` | Rebuild canonical vectors from Turso through the fixed Gemini Embedding 2 profile |
| `bun --env-file=.env.staging run vectorize:reconcile -- --run-id <runId> --exact` | Compare the Turso manifest and canonical Vectorize IDs and metadata |
| `bun --env-file=.env.staging run vectorize:golden -- --run-id <runId> --course <courseId>` | Run canonical retrieval and restricted-solution capability checks |
| `bun --env-file=.env.staging run staging:smoke-zyra -- --run-id <runId> --course <courseId> --suite canonical` | Run the approved-content Zyra smoke suite |
| `bun --env-file=.env.staging run staging:scan-zyra-privacy -- --run-id <runId>` | Reconcile Zyra cache and active-attempt privacy artifacts |
| `bun --env-file=.env.staging run staging:smoke-zyra-personalization -- --run-id <runId> --course <courseId>` | Run the zero-provider Plan 008 personalization contract smoke |
| `bun --env-file=.env.staging run staging:smoke-zyra-canvas -- --run-id <runId> --course <courseId>` | Run the zero-provider Plan 009 Learning Canvas smoke |
| `bun --env-file=.env.staging run staging:e2e-admin-tutor -- --run-id <runId> --course <courseId>` | Exercise the guarded admin and tutor workflow fixture |
| `bun --env-file=.env.staging run staging:e2e-murid -- --run-id <runId> --course <courseId> --account dedicated` | Exercise the dedicated murid read-model smoke |
| `bun --env-file=.env.staging run staging:full-rehearsal -- --run-id <runId> --plan-012-run-id <runId> --plan-013-run-id <runId> --plan-014-run-id <runId> --plan-015-run-id <runId> --with-rollback` | Verify canonical always-on routing, compatibility preservation, and rollback evidence after all predecessor result artifacts pass |
| `bun --env-file=.env.staging run staging:legacy-caller-inventory -- --run-id <runId> --fail-on-write` | Inventory remaining legacy provider matches and fail on active writers |
| `bun --env-file=.env.staging run staging:decommission-pinecone -- --dry-run --not-provisioned` | Record the exact deterministic absence fingerprint when staging never provisioned a legacy Pinecone index |
| `bun --env-file=.env.staging run staging:finalize-cutover -- --run-id <runId> --run-a <runId> --run-b <runId> --plan-012-run-id <runId> --plan-013-run-id <runId> --plan-014-run-id <runId> --plan-015-run-id <runId> --inventory-run-id <runId> --decommission-run-id <runId>` | Generate the staging-only Plan 016 go or no-go dossier after both rehearsals, zero runtime legacy callers, and confirmed decommission |

Canonical vector IDs preserve the database entity identity in metadata. IDs containing `:` use the shared URI-encoded vector-ID segment and are decoded before Turso hydration. If a Gemini rate limit interrupts `vectorize:backfill`, rerun the same `--run-id` with `--resume`; the artifact checkpoint prevents already processed vector IDs from being embedded or upserted again. Do not switch models or use a 1024-dimensional fallback.

## Bilingual interface development

The supported interface locales are `id` and `en`. Use `lib/i18n/locale.ts` for normalization and server-safe preference resolution, `lib/i18n/client.ts` for client translations and locale state, and `lib/i18n/server.ts` for server rendering and metadata. Keep paired JSON catalogs under `messages/id/` and `messages/en/`, registered by namespace in `lib/i18n/catalogs.ts`. Use display adapters for enums, but keep API error codes, role values, search category keys, URLs, and stored content unchanged. Do not translate user-authored or published academic text in place.

Run `bun scripts/check-i18n-catalogs.ts` to check paired catalog structure and consumed keys. Focused communications and search contracts can be run with:

```bash
bun test tests/contracts/email-notification-preferences.test.ts tests/contracts/notification-locale-templates.test.ts tests/marketing-cmdk-search.test.ts
```

The focused Zyra and course tests are:

```bash
bun test tests/contracts/zyra-chat-language-contract.test.ts tests/unit/zyra-stream-client.test.ts tests/contracts/student-course-overview-refactor.test.tsx
```

The account interface locale persists across visits. Conversation-specific Zyra overrides are in memory, limited to 32 sessions, and reset on drawer remount or reload and on account, course, or interface-locale changes. Do not describe that conversation override as durable storage. The final release candidate catalog gate passed 23 namespaces and 6,426 static translation calls, and the public route matrix passed 52 captures. The full role/state matrix remains incomplete; current browser evidence and its boundaries are tracked in `plans/bilingual-web-app.md`.

Background dispatch imports must remain server-safe for Deno compute. Do not add Next.js or React imports to worker-consumed message, notification, preference, or email-template modules. `proxy.ts` owns only the finite public locale rewrite map; test origin preservation and `skipProxyUrlNormalize` when changing that request boundary. Full role, locale, state, and visual verification belongs to the bilingual plan's CP7 gate.

## Environment Variables

Configured via `.env.local`. All vars are validated at startup by `lib/env.ts` (`@t3-oss/env-nextjs`).

### Required
- `DATABASE_URL` ; PostgreSQL connection URL on this isolated branch; existing deployments use local SQLite or Turso
- `BETTER_AUTH_SECRET` ; 32+ char high-entropy secret (`openssl rand -base64 32`)
- `BETTER_AUTH_URL` ; app origin for OAuth callbacks
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` ; Google OAuth
- `GOOGLE_REFRESH_TOKEN` ; Unified Google OAuth refresh token for Meet, Forms, Sheets, Drive (fallbacks: `GOOGLE_MEET_REFRESH_TOKEN`, `GOOGLE_FORMS_REFRESH_TOKEN`)
- `UPLOADTHING_TOKEN` ; UploadThing API token
- `GEMINI_API_KEY` ; Google Gemini API key (4-key rotation supported)
- `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` ; Inngest job queue

### Optional ; Storage
- `R2_ENDPOINT`, `R2_BUCKET`, `R2_PUBLIC_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` ; Cloudflare R2
- `STORAGE_PROVIDER_MODE` ; this branch supports `neon` as well as the existing `r2` and `uploadthing` modes

### Optional ; AI Gateway
- `CF_AI_GATEWAY_URL`, `CF_AI_GATEWAY_TOKEN` ; Cloudflare AI Gateway
- `CF_ACCOUNT_ID`, `CF_KV_NAMESPACE_ID`, `CF_API_TOKEN` ; KV cache for tutor

### Optional ; Authoring MCP

Bootstrap contexts bind the authenticated actor/session and environment audience. Required stage capabilities must be declared true. During a revision refresh, call `workflow.get_contract` with the existing bound run and a fresh stage bootstrap token, then use the returned replacement `runToken`. The run ID, scope, source, and expiry remain unchanged. Legacy unbound runs must restart through the catalog. Read-only legacy operation remains supported; no `AUTHORING_MCP_REQUIRE_BOOTSTRAP` runtime switch is active.

Contract checksums include the active input schemas and quality-policy version. Changes to custom refinements or semantic validation that JSON Schema cannot represent require a policy-version bump. Package build outputs carry an ownership marker: do not point `build --output-dir` at an existing unmanaged directory. Unknown files cause rejection before package files are replaced.

The endpoint uses Streamable HTTP and returns JSON responses. MCP hosts discover the protected resource and authorization server metadata, then open the Zyx sign-in page. The authenticated principal must be an active admin. OAuth defaults include all four scopes: `authoring:read`, `authoring:stage`, `authoring:review`, and `authoring:withdraw`. The consent page always shows all four supported scopes. Client-requested scopes are checked initially; other supported scopes remain unchecked until explicitly selected. At least one selection is required, and only selected supported scopes are granted. Existing tokens require reauthorization to gain additional scopes. Authenticated same-origin session connections receive all supported scopes. For a host without interactive OAuth support, an authenticated admin can call `POST /api/mcp/authoring/connection` and configure the returned bearer token with a 30-day hard lifetime; the token is bound to the originating live Better Auth session and active-admin role, can become invalid earlier if the session ends or admin access is revoked, is never permanent, and cannot be issued by an unauthenticated caller.

For prompt-only Source Pack authoring, call `catalog.list_courses`, `catalog.list_chapters`, and `source.list_files`; read selected PDFs with `source.read_file`; then send the Source Pack to `source.ingest` with `storedOriginals`. Page reads accept at most four unique positive page numbers and require `authoring:stage` in addition to `authoring:read`. They default to text and return a `jobId` when results are pending. Poll `source.get_read_job` with `fileKey` and `jobId`; use `retryFailed: true` for failed pages. Request `representation: "image"` or `"both"` for visual evidence, with `imageWidth` between 320 and 2048 px (default 1280). Image reads return absolute `imageUrl` values and citation metadata. Keys use `courses/{course}/source-images/{material}/{documentSha256}/page-{pageNumber}-{imageSha256}.png`, so source revisions and rendered-image revisions stay separate. Product Markdown can embed these URLs with the returned `Sumber: {title}, hlm. {pageNumber}` label. Page numbers are PDF positions; bibliographic details must come from verified source metadata. These are complete pages, not isolated figure extractions. `mode: "download"` returns a 15-minute signed R2 GET URL with HTTP Range support. `mode: "blob"` is a compatibility alias for download and no longer sends a PDF resource as base64. Stored files are limited to 50 MiB each and all direct plus stored originals are limited to 96 MiB. Ingested packs are stored in Cloudflare R2 and `impor_bundle` with status `validated`; existing packs can be listed via `source.list_packs`, inspected via `source.get_pack`, or referenced directly by ID in `workflow.start`.

`source.ingest` continues to accept ephemeral base64 `originals` for local files. Direct and stored originals may be mixed when document IDs are unique. Stored references are revalidated against their current course, chapter, update timestamp, checksum, safe PDF key, and R2 bytes; their Source Pack token is rejected if `workflow.start` selects another course or chapter. Validated packs persist to R2 and `impor_bundle` automatically, enabling resumption across sessions if subsequent Idea or Product Bundle authoring fails. Idea and Product tools return canonical technical and content quality reports and refuse staging when blocking issues remain. For `quiz_bank`, call `assessment.list_ideas` after `workflow.start`, send `question-bank-draft.v2` to `assessment.validate_quiz_draft`, then submit the same JSON to `assessment.submit_quiz_draft`. Each question requires non-empty `ideaLinks` targeting published Ideas in the locked course and chapter, exactly one `primary`, and positive weights summing to one; updates enforce the same rules. Legacy V1 payloads must be migrated to V2 with explicit Idea links. `assessment.update_question` updates existing Zyx-original questions in scope and returns them to `reviewStatus=generated` for admin review (`authoring:stage`); ITB example questions are immutable and published or retired questions cannot be edited.

The MCP lifecycle surface provides inventory inspection, maintenance, and review tools:
- `authoring.list_imports` and `authoring.get_import` inspect staged bundles, validation reports, and review decisions without exposing storage keys or reviewer IDs (`authoring:read`).
- `authoring.restage_idea_bundle` and `authoring.restage_product_bundle` replace staged drafts and reset prior reviews via lifecycle services (`authoring:stage`).
- `authoring.discard_product_draft` deletes draft Product Bundles and their staging artifacts (`authoring:withdraw`).
- `authoring.review_idea_bundle` and `authoring.review_product_bundle` record immutable review decisions (`authoring:review`).
- `authoring.withdraw_product_bundle` executes audited, idempotent, destructive withdrawal of published Product Bundles (`authoring:withdraw`). Published Idea Bundle withdrawal is available only in the authenticated admin review UI and is not exposed through MCP.

Publication and playbook boundaries: Idea Bundles and Product Bundles never publish through MCP; their publication requires the authenticated admin review UI. `quiz_bank` submissions stage Zyx-original questions for review (`reviewRequired=true`), whereas `reference_question_ingest` (`assessment.submit_reference_draft`) writes immutable historical reference questions directly with `status=published` (`reviewRequired=false`, `publicationTarget=reference_question_bank`) and `quiz.create`/`quiz.update` manage quiz metadata status (`draft` or `published`). Thin client skills live under `plugins/zyx-authoring-mcp/skills/` (`zyx-authoring-pipeline`, `zyx-source-pack-mcp`, `zyx-idea-bundle-mcp`, `zyx-product-bundle-mcp`, `zyx-question-authoring-mcp`, and `reference-question-ingest`), while canonical stage playbooks live on the server under `lib/authoring/playbooks/` and are fetched at runtime via `workflow.get_playbook`.

```text
https://<zyx-origin>/api/mcp/authoring
```

### Optional ; Zyra provider router
- `ZYRA_CONTROL_PLANE_URL` ; staging control-plane Worker origin, no query string
- `ZYRA_CONTROL_PLANE_TOKEN` ; server-only staging Worker bearer secret, never log or expose
- `STAGING_ZYRA_PROVIDER_ROUTER_USER_ID` ; dedicated staging identity for the bounded Plan 005 provider smoke
- `FEATURE_ZYRA_PROVIDER_ROUTER_V2` ; enables the lease-aware four-project provider lifecycle. Keep absent or `0` outside the reviewed staging smoke.

### Optional ; Zyra semantic cache
- `FEATURE_ZYRA_SEMANTIC_CACHE_V1` ; enables the privacy-safe exact and semantic scaffold cache. Keep absent or `0` unless the staging cache gate is being exercised.

### Optional ; Zyra model registry
- `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3`, `GEMINI_API_KEY_4` ; additional staging project keys. The primary slot is `GEMINI_API_KEY` and `GEMINI_API_KEY_1` is accepted only as its compatibility alias.
- `GEMINI_PROJECT_ALIAS_1` through `GEMINI_PROJECT_ALIAS_4` ; non-secret distinct project aliases such as `gemini-project-1` through `gemini-project-4`.
- The real Plan 002 probe requires all four staging key slots, never prints key values, and refuses a request cap above 40. The mock probe makes zero network calls.

### Optional ; Canonical Vectorize
- `VECTORIZE_WORKER_URL`, `VECTORIZE_SHARED_SECRET` ; authenticated canonical Vectorize worker
- `RESTRICTED_SOLUTION_CAPABILITY` ; staging Worker capability required for published solution retrieval
- Canonical Vectorize, Idea hydration, admin and tutor workflow, and murid read models are always-on. Legacy rows and URLs remain readable for compatibility.

### Optional ; Production Services
- `DIKTAT_RENDERER_URL`, `DIKTAT_RENDERER_SECRET` ; Puppeteer PDF service
- `AUTHORING_VERIFICATION_BROWSER_PROVIDER` ; `cloudflare` (default) or `steel`, only for V4 verification
- `STEEL_API_KEY` ; server-only Steel key, never a public variable
- `AUTHORING_VERIFICATION_STEEL_BROWSER_VERSION` ; reviewed exact four-part Chromium version, required for Steel plans and execution
- `AUTHORING_VERIFICATION_RENDERER_URL`, `AUTHORING_VERIFICATION_RENDERER_SECRET` ; private V4 browser/PDF verification service, separate from the existing PDF renderer
- `NEXT_PUBLIC_REALTIME_URL`, `LIVE_HMAC_SECRET` ; Live quiz Worker
- `WHATSAPP_ADMIN_NUMBER` ; Admin WhatsApp notifications
- `NEXT_PUBLIC_WHATSAPP_NUMBER` ; Public browser WhatsApp number for paid and Custom plan CTAs. Required to enable those links; if absent, the CTAs stay disabled or hidden. It is not a fallback for admin notifications.
- `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_PUBLIC_KEY`, `SENTRY_OTLP_TRACES_URL`, `SENTRY_VERCEL_LOG_DRAIN_URL` ; Sentry error monitoring and performance tracking

### Staging overhaul guard

Remote staging commands must load `.env.staging`, set `ZYX_ENVIRONMENT=staging`, and set `ALLOW_STAGING_MUTATION=1` only for an explicitly reviewed write. `STAGING_EXPORT_KEY` is supplied outside Git and is required for keyed manifests and encrypted exports. Production counterparts are compared before a staging command can continue. Do not use `db:sync-prod-to-staging`; its replacement is the separately named destructive command `db:sync-prod-to-staging:destructive`, which also requires the explicit confirmation phrase.

Plan 006 staging workflow commands are:

```bash
bun --env-file=.env.staging run staging:preflight
bun --env-file=.env.staging run staging:test-idea-bundle -- --run-id <runId> --fixture all
bun --env-file=.env.staging run staging:reconcile-bundle -- --run-id <runId> --type idea
```

The staging test uses the authenticated Wrangler R2 adapter only for the test process when the staging script enables `STAGING_BUNDLE_WRANGLER_STORAGE=1`; production runtime storage remains the normal R2 provider.

The Zyra Plan 006 cache checks are:

```bash
bun test tests/contracts/zyra-cache-key.test.ts tests/contracts/zyra-cache-privacy.test.ts tests/contracts/zyra-single-flight.test.ts tests/contracts/zyra-semantic-cache.test.ts tests/contracts/zyra-cache-budget.test.ts tests/contracts/ai-gateway-metadata.test.ts workers/zyra-control-plane/tests/cache-ledger.test.ts
bun scripts/eval-zyra-semantic-cache.ts
bun --env-file=.env.staging scripts/staging/smoke-zyra-cache.ts --run-id <runId> --max-provider-requests 20
```

The cache smoke uses the existing staging control-plane credentials through the local env file, keeps the semantic index separate from canonical retrieval, and records only masked status and counts. It does not require a new credential or a production flag. The accepted evidence is `artifacts/zyra-ai/20260807-plan006-cache-smoke-v10/plan-006-cache-smoke.json`.

Plan 007 local pedagogical checks are:

```bash
bun test tests/contracts/zyra-pedagogy-state.test.ts tests/contracts/zyra-teaching-response.test.ts tests/contracts/zyra-assessment-safety.test.ts tests/contracts/tutor-rag.test.ts tests/contracts/zyra-pedagogy-shadow.test.ts tests/contracts/zyra-pedagogy-human-review.test.ts tests/contracts/zyra-canonical-runtime.test.ts
bun scripts/eval-zyra-pedagogy.ts
bun run typecheck
bun --env-file=.env.staging scripts/staging/smoke-zyra-pedagogy.ts --run-id <runId> --course tutorial-pka --max-provider-requests 40
bun --env-file=.env.staging scripts/staging/smoke-zyra-pedagogy.ts --run-id <runId> --course tutorial-pka --max-provider-requests 40 --startup-diagnostics-only
bun --env-file=.env.staging scripts/staging/smoke-zyra-pedagogy.ts --run-id <runId> --course tutorial-pka --max-provider-requests 40 --remote-shadow
bun scripts/staging/validate-zyra-pedagogy-review.ts --run-id <runId> --submission-file <downloaded-review.json>
```

The primary Zyra pedagogy path is always-on. Zyra runtime values are read through `lib/zyra/runtime-env.ts`, which validates only the optional granular capabilities used by the runtime and does not require unrelated UploadThing or Resend credentials. Fixture mode and `--startup-diagnostics-only` make no provider calls. Shadow mode remains an explicit staging request for the exact configured identity, keeps the legacy answer visible, suppresses learner side effects, and stores privacy-safe comparison traces. The current implementation budgets at most seven provider calls per shadow case, so a cap of 40 permits five cases. It never prints secrets or authenticated URLs.

Plan 008 local personalization checks are:

```bash
bun test tests/contracts/zyra-profile-evidence.test.ts tests/contracts/zyra-adaptation.test.ts tests/contracts/zyra-profile-privacy.test.ts tests/contracts/zyra-profile-auth.test.ts
bun run lint
bun run typecheck
bun --env-file=.env.staging run staging:smoke-zyra-personalization -- --run-id <runId> --course tutorial-pka
```

The personalization layer is always-on. The additive migration is `0067_zyra_continuation.sql`; staging schema reconciliation completed on 2026-08-12. The synthetic smoke uses no provider calls, database writes, trace writes, or learner side effects. Profile inference uses bounded allowlisted event fields, keeps explicit preferences separate, expires evidence, supports reset, and composes only after the shared profile-free scaffold. Functional staging verification and rollout remain separate gates.

Plan 009 local canvas checks are:

```bash
bun test tests/contracts/learning-canvas-schema.test.ts tests/contracts/learning-canvas-expression.test.ts tests/contracts/learning-canvas-renderer.test.ts tests/contracts/learning-canvas-accessibility.test.tsx
bun run eval:zyra-canvas
bun --env-file=.env.staging run staging:smoke-zyra-canvas -- --run-id <runId> --course tutorial-pka
```

The canvas layer is always-on. Canvas specs are typed, claim-scoped, profile-free, and rendered through application-owned components. Expression controls are evaluated locally through an allowlisted AST. Invalid expressions produce fallback points and table or text fallbacks remain available. The smoke makes zero provider calls and zero writes.

### Zyra Plans 010 through 014

Plan 010 private image checks:

```bash
bun test tests/contracts/zyra-attachment-validation.test.ts tests/contracts/zyra-attachment-auth.test.ts tests/contracts/zyra-multimodal-adapter.test.ts tests/contracts/zyra-image-assessment.test.ts tests/contracts/zyra-image-cache-isolation.test.ts tests/contracts/zyra-image-composer.test.tsx
bun run eval:zyra-images
bun --env-file=.env.staging run staging:smoke-zyra-images -- --run-id <runId> --course tutorial-pka
```

The multimodal provider contract also requires `tests/contracts/ai-request-lifecycle.test.ts`, `tests/contracts/model-registry.test.ts`, and `tests/contracts/provider-adapters.test.ts`. These verify direct Interactions routing, the gateway-compatible image fallback, bounded fallback attempts, one allowance commit on success, and allowance refund when no provider returns an answer.

`FEATURE_ZYRA_IMAGE_INPUT_V1` controls the optional image layer. The server accepts only JPEG, PNG, and WebP, sanitizes them with bounded `sharp` decoding, writes only sanitized bytes to the private storage path, and rejects UploadThing for this feature. Image turns bypass shared caches. Expired rows are application-inaccessible and can be removed by `sweepExpiredZyraAttachments`. The local smoke makes zero provider calls and zero writes.

The controlled staging cleanup command is `bun --env-file=.env.staging run staging:sweep-zyra-attachments -- --run-id <runId> --limit 100`. It deletes only expired private attachment objects and then marks their rows expired. Storage failures remain retryable and never make an unexpired row inaccessible.

Plan 011 murid experience checks:

```bash
bun test tests/contracts/zyra-murid-client.test.ts tests/contracts/zyra-selection-ask.test.tsx tests/contracts/zyra-pet.test.tsx tests/contracts/zyra-usage-ui.test.tsx tests/contracts/zyra-drawer-journeys.test.tsx
bun --env-file=.env.staging run staging:smoke-zyra-murid -- --run-id <runId> --course tutorial-pka --synthetic-user
```

The integrated murid Zyra experience is foundational; selection-to-ask and the Zyra pet are always-on. The only public mirror is `NEXT_PUBLIC_FEATURE_ZYRA_IMAGE_INPUT_V1` for the image capability. The allowance component reads only the authenticated user's summary, selection-to-ask sends a bounded quote, and the pet receives state from request, upload, response, quota, and error events.

Plan 012 copilot checks:

```bash
bun test tests/contracts/zyra-proposal-schema.test.ts tests/contracts/zyra-proposal-lifecycle.test.ts tests/contracts/zyra-proposal-auth.test.ts tests/contracts/zyra-tutor-copilot.test.ts tests/contracts/zyra-admin-copilot.test.ts
bun run eval:zyra-copilots
bun --env-file=.env.staging run staging:smoke-zyra-copilots -- --run-id <runId> --course tutorial-pka --no-auto-apply
```

`FEATURE_ZYRA_TUTOR_COPILOT_V1` and `FEATURE_ZYRA_ADMIN_COPILOT_V1` are opt-out switches (enabled unless explicitly `0`) for proposal surfaces. Proposals use typed operations, scope and precondition snapshots, expiry, and audit events. The currently registered operation is read-only; unregistered mutation operations are rejected before persistence. Applying a proposal is intentionally blocked until the accepted Overhaul mutation boundary is available.

Plan 013 operations checks:

```bash
bun test tests/contracts/zyra-telemetry-schema.test.ts tests/contracts/zyra-ops-aggregation.test.ts tests/contracts/zyra-ops-auth.test.ts tests/contracts/zyra-ops-alerts.test.ts tests/contracts/zyra-usage-ui.test.tsx
bun run eval:zyra-operations
bun --env-file=.env.staging run staging:smoke-zyra-operations -- --run-id <runId> --synthetic-only
```

`FEATURE_ZYRA_AI_OPS_V1` controls the optional operations dashboard. Operational events use fixed columns and never store prompts, responses, raw keys, filenames, object keys, image descriptions, or raw identity. Provider usage outside the Zyx ledger is shown as unknown. The admin metrics response uses the Asia/Jakarta day boundary and emits deduplicated alert codes with rollback instructions in `docs/operations/zyra-ops-runbooks.md`.

Plan 014 is a release verifier, not a deployment command:

```bash
bun --env-file=.env.staging run staging:run-zyra-release-gate -- --run-id <runId> --max-provider-requests 40 --synthetic-users-only
```

The verifier writes a masked result and returns `BLOCKED` until predecessor evidence, Plan 007 remote shadow and maintainer review, a clean reviewable worktree, and the separately approved live matrix are present. It never changes retained rollout flags or performs a live provider run.

### Zyra control-plane worker

The Plan 001 Worker is independently typechecked with `workers/zyra-control-plane/tsconfig.json` and locally bundled with:

```bash
./node_modules/.bin/wrangler deploy --dry-run --env staging --config workers/zyra-control-plane/wrangler.jsonc
bun test workers/zyra-control-plane/tests/foundation.test.ts
```

The dry-run is local compilation only. An authenticated deployment requires explicit staging authorization, the root Cloudflare token, and the operator-provided `ZYRA_CONTROL_PLANE_TOKEN`. This plan provisions infrastructure only; optional user-visible Zyra capabilities remain behind their explicitly approved flags.

Plan 003 extends the same Worker with the SQLite-backed `ZyraQuotaCoordinator` lease ledger. It keeps project aliases fixed to the four registry aliases, stores only a SHA-256 user hash, and records provider-safe outcome dimensions. Run its local suite with:

```bash
bun test workers/zyra-control-plane/tests/quota-clock.test.ts workers/zyra-control-plane/tests/quota-state.test.ts workers/zyra-control-plane/tests/quota-concurrency.test.ts workers/zyra-control-plane/tests/quota-privacy.test.ts
./node_modules/.bin/wrangler deploy --dry-run --env staging --config workers/zyra-control-plane/wrangler.jsonc
```

The staging smoke uses synthetic leases only and does not call Gemini. The Worker deployment is staging-only and requires explicit approval. A real staging run requires the existing `ZYRA_CONTROL_PLANE_TOKEN` to be available to the local process and `ZYRA_CONTROL_PLANE_URL` or an explicit `--url`; neither value is printed or written to evidence. The latest staging run passed with 60 accepted reservations, 40 expected quota rejections, 60 committed transitions, fairness spread 0, and zero synthetic provider calls. Evidence is recorded in `artifacts/zyra-ai/20260807-plan003-final/plan-003-result.json`.

The canonical assessment path is always-on: stable option IDs, chapter-scoped assessment metadata, deterministic blueprint selection, and Plan 010 evidence and benchmark contracts. Legacy snapshots remain readable and authoritative for historical attempts.

The canonical per-Idea learning loop is always-on: append-only evidence writers, deterministic mastery and confidence, compatibility reads, and flashcard recommendation priorities with suppression for mastery scores of 80 or higher. It never enables an AI call.

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

The live compatibility bridge always writes the canonical targets transactionally while preserving legacy rows and snapshots for compatibility. No migration rollout flag is required.

## Feature Flags

Feature flags are exception-based rollout controls, not a requirement for every new capability. Keep a capability always-on when it is foundational, stable, part of core authorization, retrieval, assessment, learning, or pedagogy, or when a flag would only mirror an implementation boundary. Consider a flag when the capability is optional, experimental, expensive or externally side-effectful, audience or environment specific, or needs a reversible kill switch.

Before adding or removing a flag for a new capability or material behavior change, the agent or maintainer must ask the owner to choose always-on or flag-gated when the request has not already decided it. The decision records the proposed key, reason, default, scope, rollback behavior, owner, and removal condition. A temporary operational flag may protect a high-risk migration or provider boundary, but it is not automatically a product flag or an admin catalog entry.

A retained flag is active only when its value is `"1"` or `"true"`; an absent value keeps that optional capability hidden. Foundational behavior is always-on and intentionally has no env flag.

Current approved vital flags (< 10 flags retained for high-impact runtime control):

| Flag | Feature | Scope |
|------|---------|-------|
| `FEATURE_PKA` | Tutorial PKA campaign course & registration gate | Academic / Campaign |
| `FEATURE_REFLECTION_EMAIL` | Weekly reflection email batch dispatch gate | Academic / Resend |
| `FEATURE_LIVE` | Real-time interactive classroom & Cloudflare Worker switch | Quiz & Live |
| `FEATURE_DIKTAT_AI` | LLM quota protection for Diktat AI audit suggestions | AI Architecture |
| `FEATURE_ZYRA_IMAGE_INPUT_V1` | Learner multimodal image input & vision quota switch | AI Architecture |
| `FEATURE_ZYRA_SEMANTIC_CACHE_V1` | Vectorize semantic cache kill switch for semantic drift | AI Architecture |
| `FEATURE_DRIVE_EDITOR_SYNC` | Auto-grant editor permission synchronization on Drive | Platform / Admin |
| `FEATURE_STRUCTURED_ARTICLE_READER_V1` | Structured V3 authoring, submission, and review rollout | Academic / Admin |

> Foundational features (Tutor Portal & Overhaul, Remediation, Adaptive Quiz, Concept Graph, Interactive Material, Weekly Reflections, Tutor Analytics, Question Generator Critic, Idea & Product Bundles, Authoring Context, Zyra Allowance & Provider Router, Learning Canvas, Selection-to-Ask, Zyra Pet, AI Ops, Media Library, Link Library, Form Presets) are now mature and always-on by default, secured by role-based authorization (RBAC).

The admin flag page reads this catalog from `lib/feature-flags.ts`; arbitrary `FEATURE_*` variables are not surfaced. `FEATURE_STRUCTURED_ARTICLE_READER_V1` defaults to disabled. It is owned by Akademik dan Konten together with the Zyx platform owner. Its rollback disables V3 authoring, submission, and review selection without deleting V3 data or hiding products that are already published from students. See [the rollout runbook](operations/structured-article-v3-rollout.md). Decommissioned flags have been removed from `lib/env.ts`, runtime schemas, environment files, and operational scripts.

## Code Conventions

- **DB schema**: `db/schema.ts` only. Edit → `bun run db:generate` → `bun run db:migrate`. Never hand-edit `drizzle/`.
- **Auth**: Better-Auth (credentials + Google OAuth). Canonical access roles: `admin`, `tutor`, `murid`; `user.role` remains a legacy compatibility projection during expand.
- **AI calls**: All Gemini traffic routes through Cloudflare AI Gateway when `CF_AI_GATEWAY_URL` is set.
- **Cost rule**: AI quota is spent only on tutoring, mistake feedback, and content generation. Streaks, recommendations, study paths, reflections are deterministic SQL + logic.

## Google Spreadsheet Export Workflow

Exports route through `lib/google-sheets.ts` and `POST /api/admin/export-spreadsheet`. The spreadsheet is updated in place; the app owns only the data block at A1 (header + data rows) and writes it with an explicit `GridRange`, so admin edits in the reserved manual zone (columns right of the data, rows below it) are never overwritten.

Before an overwrite the current grid is read and diffed against `export_spreadsheets.last_written_fingerprint` plus the stored row/column counts. Detected manual edits inside the owned block, growing rows over manual cells, or growing headers over manual columns return `needsConfirmation` with `block_modified`, `manual_rows`, or `manual_columns` codes. Client callers use `useSpreadsheetExport` (`components/admin/spreadsheet-export.tsx`) to show a confirm dialog and re-send with `confirmOverwrite: true`. New spreadsheets store the baseline so later re-exports can warn precisely; legacy sheets without metadata infer the previous block from the current grid on the first re-export.

Set `FEATURE_DRIVE_EDITOR_SYNC=1` to grant every active admin email `writer` access on exported spreadsheets, Google Forms, recording files, transcripts, and new export folders.

Meet member provisioning uses `https://meet.googleapis.com/v2beta/spaces/{space}/members`. The Google Cloud project and OAuth principal must be enrolled in the Google Workspace Developer Preview Program, and the refresh token must include the Meet space settings scope. Without Preview access or the scope, space creation still succeeds but the admin UI reports each co-host or invitee grant that failed.

## Type Checking & Linting

```bash
bun run lint          # ESLint
bunx tsc --noEmit      # Full type check
bun run build         # Production build (catches all errors)
```

## AI Contract Testing

All deterministic contract test suites live in `tests/contracts/` and run without network calls.

### Running Tests

- Run full AI contract suite: `bun run test:ai-contracts`
- Run single contract test: `bun test tests/contracts/prompt-executor.test.ts`
- Run tutor contract test suite:
  ```bash
  bun test tests/contracts/tutor-authorization.test.ts tests/contracts/tutor-capability-boundary.test.ts tests/contracts/tutor-grading-scope.test.ts tests/contracts/tutor-schedule-policy.test.ts tests/contracts/tutor-schedule-actions.test.ts tests/contracts/tutor-mutation-audit.test.ts tests/contracts/tutor-activity-log.test.ts tests/contracts/tutor-live-access.test.ts tests/contracts/tutor-downstream-bridge.test.ts tests/contracts/zyra-proposal-lifecycle.test.ts
  ```

### Adding Fixtures

1. Place JSON fixtures inside `tests/fixtures/ai/<family>.json`.
2. Every fixture file must contain `"schemaVersion": "1.0"` and a valid `"requirementId"` (e.g. `"AI-TUTOR-CIT-001"`).
3. Load fixtures using `loadAiFixture("<family>.json")` from `@/tests/helpers/ai-fixtures`.

### Contract Tests vs Model Quality Evaluations

- **Contract Tests (`tests/contracts/`)**: Deterministic, zero network calls, unit-isolated, mock/fake adapters (`fakeAi`, `fakeCache`), validating system invariants and schema structures.
- **Model Quality Evaluations**: Live model benchmarks evaluating accuracy, reasoning quality, or LLM output style requiring active API keys.

### MCP PDF page reads and downloads

`source.read_file` defaults to text and accepts up to four unique positive PDF page positions. It returns either completed page results or `status: "pending"`, `jobId`, `processingRequestId`, and `pollAfterMs`. `source.get_read_job` accepts `fileKey` and `jobId`; it rechecks the current source scope and binds job access to the initiating admin session. A fresh file key can resume a job in the same session. Completed results do not download the original PDF again. Catalog listings use stored metadata and do not parse PDFs just to populate page counts.

`source-read-page` runs on the existing Deno Inngest compute app, with two automatic retries and concurrency two. Each event owns one page, so successful pages survive another page failing. Exhausted pages show `failed`; polling with `retryFailed: true` requeues only those pages. Job manifests and per-page status/results are private R2 objects under `overhaul/source-read-jobs/{jobId}/`. These objects contain source identifiers and must remain private. Enqueue IDs deduplicate initial dispatch; an incomplete dispatch can be resumed. Job identity includes the source version, checksum, page list, representation, resolution, renderer version, actor, and session.

The compute reader caches results at `overhaul/pdf-page-cache/{documentSha256}/{rendererVersion}/width-{resolution}/page-{pageNumber}.{json,png}`. The checksum is computed from current PDF bytes on compute. Text-only entries use a `-text` renderer suffix, width 1 as an internal cache sentinel, and JSON only. Image-only entries use `-image` and omit text extraction. Both-mode entries retain the existing cache namespace. Full cache hits skip parser initialization and rendering; partial hits process only missing or corrupt pages. Image entries commit PNG before JSON metadata. Storage permission and connectivity errors propagate.

Stage logs are JSON with `event: "source.read_file"`, `requestId`, `stage`, `status`, and completed-stage `durationMs`. Stages cover source fetch, parser info/text, render, cache, persisted output, MCP formatting, and transport response preparation. `started` identifies a stage still running when the connection ends. `send.transport` measures server response preparation, not client receipt. Pending responses expose the processing request ID for worker correlation. The internal synchronous RPC still has a 15-second request budget; timeouts map to `SOURCE_READ_TIMEOUT`, not invalid arguments. MCP page reads use the job path and do not hold this RPC connection open.

For the original file, call `source.read_file` with `mode: "download"` and save its payload to an ignored local descriptor JSON file. Run `bun scripts/download-source-pdf.ts descriptor.json output.pdf`. The client stores a `.part` file and `.resume.json` containing ETag, total size, and checksum, without persisting the signed URL. It downloads in 1 MiB HTTP Range chunks, validates Content-Range and ETag, and verifies SHA-256 when known. After interruption, rerun the command. After URL expiry, request a new descriptor for the same source and rerun. Changed sources or an existing destination are rejected. A client without binary download support continues using page reads and job polling. Remote R2 Range behavior and Inngest registration require separate deployment verification.

### Local V4 verification

V4 uses JSXGraph, KaTeX/mhchem, pinned `pdfjs-dist` and `@napi-rs/canvas`. Local browser verification uses installed Playwright Chromium. Deployment uses the existing Deno worker and the configured Cloudflare Browser Run or Steel provider over CDP. Provider and exact browser version bind the plan. Local verification keeps installed Chromium unless a remote provider is explicitly configured; remote providers require the allowed deployed preview origin. PDF page evidence uses the existing PDF parser and needs no Poppler. Keep the traced source closure, package manifests, KaTeX assets and PDF standard fonts available.

Build the private renderer with `bun scripts/authoring/build-local-verification-renderer.ts`; start its emitted Node module against the authorized local web server as described in [the runbook](operations/authoring-mcp-skills.md). Supply `AUTHORING_VERIFICATION_RENDERER_SECRET` only through the environment. `bun scripts/authoring/verify-local-v4.ts --renderer http://127.0.0.1:3101` exercises a synthetic canonical ZIP and local storage ports, saving evidence under ignored `artifacts/authoring-verification/local-run/`. It performs no deployment or remote storage mutation. SQLite boundary tests and MCP transport tests exercise their separate boundaries.

## Python coding runtime

Install pinned dependencies with Bun. Staging interactive Playground and Article
examples use the Python worker and require the server-only
`PYTHON_RUNTIME_TOKEN_SECRET` shared with the staging worker. Other browser
Python assets are served locally from the Pyodide package. Local Submit
requires Playwright Chromium with a functioning kernel sandbox. Run
`bun run test:visual:install` when browsers are missing. Production Submit reuses
`CF_ACCOUNT_ID` and `CF_API_TOKEN` for Cloudflare Browser Run. Explicit
`CODING_BROWSER_PROVIDER=steel` uses the existing session adapter and
`STEEL_API_KEY`, independently of `AUTHORING_VERIFICATION_BROWSER_PROVIDER`.
`local` is permitted only outside production. No automatic provider fallback or
coding feature flag is introduced. Real Steel grading is verified against local
synthetic fixtures; deployed connectivity remains a separate boundary. See the
[coding contract](coding-foundation.md) and [verification evidence](coding-verification.md).

For an opt-in real runtime probe, run
`RUN_CODING_RUNTIME_PROBE=1 CODING_BROWSER_PROVIDER=steel bun --conditions=react-server scripts/coding/probe-runtime.ts`
or bundle it with
`bun build scripts/coding/probe-runtime.ts --target=node --packages=external --outfile=artifacts/coding-live/probe-runtime.mjs`
and run Node with `--conditions=react-server`. Supply credentials only through the
server environment. The probe asserts real Python results and releases each session in finally.
It uses bounded batches to stay within the 120-second provider session lifetime. It touches no database. A failed assertion is a failed verification,
not a passing provider smoke test. Managed environments must preserve the policy
proxy and TLS trust for REST and CDP.
Apply generated migrations only to the selected database environment.


For managed-environment Steel testing, first verify `STEEL_API_KEY_GLOBAL` is
nonempty without printing its value. Map it only for the test process; never
change the application default provider. The opt-in CDP proxy preload uses the
inherited HTTPS policy proxy and keeps TLS validation enabled:

```sh
mkdir -p artifacts/coding-live
bun build scripts/coding/probe-runtime.ts --target=node --packages=external --outfile=artifacts/coding-live/probe-runtime.mjs
STEEL_API_KEY="$STEEL_API_KEY_GLOBAL" CODING_BROWSER_PROVIDER=steel RUN_CODING_RUNTIME_PROBE=1 python scripts/coding/local-env.py node --conditions=react-server --require ./scripts/coding/steel-policy-proxy.cjs artifacts/coding-live/probe-runtime.mjs
```

To exercise the actual browser Run adapter, start a local app at
`http://127.0.0.1:3000` with the local environment wrapper, then run:

```sh
bun build scripts/coding/browser-probe-entry.ts --target=browser --format=iife --outfile=artifacts/coding-live/browser-runtime.js
bun build scripts/coding/probe-browser-runtime.ts --target=node --packages=external --outfile=artifacts/coding-live/probe-browser-runtime.mjs
STEEL_API_KEY="$STEEL_API_KEY_GLOBAL" CODING_BROWSER_PROVIDER=steel RUN_CODING_BROWSER_PROBE=1 python scripts/coding/local-env.py node --conditions=react-server --require ./scripts/coding/steel-policy-proxy.cjs artifacts/coding-live/probe-browser-runtime.mjs
```

This probe bridges only public runtime routes to Steel. It sends no app cookie,
uses no grading mock, and executes real Python in the unchanged
`allow-scripts` opaque iframe. It is runtime evidence, not an authenticated
Playground page or visual sign-off. The preload is test tooling, not automatic
production provider or transport configuration.

The local coding wrapper uses fictional public Firebase identifiers to let the
foreground notification listener initialize without remote project bindings.
Keep push consent denied in synthetic UI probes; do not register a remote token.
### Isolated hosted workflow checks

Use only the guarded migration environment for `scripts/neon/smoke-booking-workflow.ts` and `scripts/neon/smoke-authoring-workflow.ts`. The booking script invokes deployed server actions and removes its synthetic records. The authoring script stages a synthetic V4 bundle, checks stale-edit and publication gates, requests real worker verification, and exercises review/publication/PDF download. It retains fixture metadata while a worker job is in flight; `--resume` continues that exact import and attempt rather than enqueuing a duplicate. `--cleanup-only` verifies saved workflow proof and terminal Inngest completion before removing its exact owned records and objects. Never delete its retained fixture while Inngest is still executing. Real Google sessions are not test fixtures and must be preserved.
