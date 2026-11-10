# Neon Functions worker cutover

Status: OPEN / IN PROGRESS

Owner: Zyx engineering. On 2026-11-10 the owner explicitly prioritized production worker recovery and deferred staging web/DNS work. Production deployment requires exact target checks, signed Inngest delivery and representative PDF acceptance; registration alone does not establish all 22 business paths.

## Boundaries

The staging worker is `zyxcompute` on project `muddy-sky-44104897`, branch `br-gentle-scene-azq0gp91` in Singapore. The protected production branch is excluded by the deployment script. Inngest retains orchestration, retries, durable steps and schedules. Neon replaces HTTP execution. The 22 primary functions register 25 handlers including three failure handlers.

Web staging remains deferred. Its Cloud Run service has disabled billing; a Vercel staging domain association was prepared but DNS was not changed. Production recovery replaces suspended Deno with a guarded Neon worker and a coordinated Vercel web release. Exhausted Deno quota prevents treating it as a working rollback destination.

PDF.js extraction, page images, thumbnails and source crops run in Cloudflare Browser Run through Playwright CDP. HTML to PDF reuses the environment's existing diktat renderer and its BROWSER binding. Closing the remote browser session releases its contexts. Browser operations have a 120-second deadline. PDF inputs are limited to 50 MiB. Crops retain rotation handling and the 16-million-pixel guard. Browser version mismatches fail closed. Packaged PDF.js WASM/JavaScript decoders preserve JPEG2000 images; a red-pixel fixture catches silent blank rendering.

Native canvas alone exceeds Neon's 10 MiB compressed archive limit. The build packages Node 24 ESM, Playwright, KaTeX and browser PDF assets, rejects leaked native PDF imports and enforces Neon SDK archive limits. The tested archive is approximately 6 MiB. The module-scoped PostgreSQL pool has at most five connections and is attached to the Neon runtime for idle disconnect handling.

## Guarded deployment

1. Install the frozen Bun lockfile. Run `bun scripts/authoring/prepare-web-verification.ts` with the existing build-placeholder environment, then `node scripts/neon/build-worker.mjs`. Windows needs `NPM_CLI_PATH` pointing to the official npm CLI entry file for Linux ARM64 package staging.
2. Prepare a private runtime JSON with `.github/scripts/prepare_worker_runtime.py`, explicit GITHUB_ENVIRONMENT_NAME, and the selected GitHub environment's secret/variable JSON. The allowlist excludes CI credentials. Local .env.prod has stale Turso/Inngest routing and must not supply production settings.
3. Run `node scripts/neon/deploy-worker.mjs <private-runtime-json> <private-neon-env> <staging|production>`. The credential file contains NEON_API_KEY. The script verifies the exact branch protection, database, storage, app and renderer identities and independently checks signing/event keys against the selected Inngest environment. It records safe before/after identities and verifies the active health revision against the archive SHA-256.
4. Run `node scripts/neon/sync-worker.mjs <staging|production>`. HTTP PUT registers the new endpoint with Inngest through the worker signing configuration.
5. Run `bun scripts/neon/smoke-worker.ts <staging|production>`. It checks authentication failures, a real Inngest page-read run reaching Completed, persisted text, PNGs, JPEG2000 pixels, invalid-page error handling, cache, HTML to PDF and PDF readback. It cleans its own source fixtures. Nonterminal jobs retain their source for diagnosis. Content-addressed cache entries may remain.
6. Build `scripts/neon/smoke-browser-pdf.ts` for Node into `artifacts/neon-worker/`, then execute it beside the packaged pdf-assets.json. It checks inspection and crop geometry and saves PNG variants for direct inspection.

The workflow is `.github/workflows/deploy-neon-worker.yml`, called by deploy.yml for the selected environment. Both GitHub environments have explicitly approved NEON_API_KEY secrets. Google is not needed for worker deployment. A manual production recovery can dispatch deploy.yml on a reviewed release branch with diagnostic_environment=production and all diagnostic/restore booleans false. CI waits for worker deployment before web deployment. Private environment files must never be uploaded as artifacts.

## Acceptance and production gate

Record event/run IDs, terminal status and business output for generation, assessment, mastery, analytics, reflection, audit, vector/search sync, admin operations/knowledge, source reads/figures, thumbnails, Diktat PDFs and V4 verification. Use owned staging fixtures. Verify email and vector destinations before global scheduled work. A missing-record response or no-op does not verify a business path.

Deploy matching web and worker revisions before V4 acceptance. The worker uses an embedded build fingerprint. New page caches use renderer revision v3; new figure requests use v2. Completed legacy figure manifests remain readable and replayable. Unfinished v1 requests require a fresh request after rollout.

For the authorized production recovery, verify the exact protected production branch, database, private bucket, renderer and Inngest environment. Record previous endpoint/deployment identities, deploy and test, then coordinate web COMPUTE_SERVICE_URL and the matching web build with the Inngest endpoint. Do not withdraw published content or manufacture verification receipts during this cutover.

## Cost and recovery

Neon and Cloudflare retain metered usage and limits. Reported Neon credit does not establish Cloudflare credit. No plan upgrade is included. The minute outbox cron is retained, so low website traffic does not imply zero invocations. compute.request logs record wall duration and process CPU; overlapping process CPU cannot provide per-job billing attribution.

For staging regression, restore the previous successful Neon archive and matching build identity, then resync Inngest. Preserve pending fixtures until terminal state or explicit cancellation. Suspended Deno is not a verified recovery target. Production requires its own working rollback target before cutover.

## Acceptance checkpoint, 2026-11-10

Seven primary functions completed real Inngest runs on Neon staging, including the vector cron. This is a partial business-path checkpoint. Eight initial HTTP/PDF integration checks passed. Separate Browser Run tests passed PDF inspection and crop geometry for rotations 0, 90, 180 and 270. The preview PNGs were inspected directly. The all-correct feedback fixture intentionally makes no AI call.

| Primary function | Evidence or remaining gate |
| --- | --- |
| admin-operations-outbox | Three observed cron runs Completed; empty outbox path |
| source-read-page | Completed; persisted synthetic PDF text verified |
| pdf-thumbnail-worker | Completed; PNG width 720 and database thumbnail URL verified |
| quiz-feedback-worker | Completed; valid all-correct quiz, no feedback row expected |
| source-figure-extraction | Completed with validated synthetic Source Pack; both PNG checksums verified |
| product-v4-verification | Pending matching web deployment and reachable staging preview |
| product-diktat-pdf-worker | HTML/PDF rendering and inspection helpers passed; product job pending |
| diktat-pdf-worker | Completed; full Diktat PDF, audit, storage and thumbnail follow-up verified |
| vector-sync-worker | Pending owned vector fixture |
| vector-sync-cron-worker | Scheduled run Completed; owned vector business fixture remains pending |
| sync-search-documents | Pending owned search fixture |
| admin-ops-knowledge-sync-worker | Pending staging catalog/vector acceptance |
| bulk-chapter-generator | Pending generation fixture and persisted outputs |
| question-generation-worker | Pending generation fixture and persisted questions |
| assessment-ingest-worker | Pending assessment fixture and persisted extraction |
| mastery-recompute-worker | Pending mastery fixture and persisted results |
| idea-mastery-recompute-v1 | Pending idea mastery fixture and persisted results |
| mastery-snapshot-cron | Pending staging snapshot acceptance |
| course-analytics-snapshot-cron | Pending staging analytics acceptance |
| student-quiz-analytics-worker | Pending analytics fixture and persisted results |
| weekly-reflection-cron | Pending controlled reflection test; avoid email to existing users |
| content-quality-audit-cron | Pending staging content audit acceptance |

Run `bun scripts/neon/smoke-business-workers.ts` only against its pinned staging target for owned thumbnail, feedback, source-figure and Diktat fixtures. Safe run IDs are written to artifacts/neon-worker/business-smoke.json. Production smoke artifacts use artifacts/neon-worker/production/. The archive also includes all 11 allowlisted nonvirtual admin knowledge documents; this fixes a missing-files runtime failure, while execution in Neon still needs verification.
