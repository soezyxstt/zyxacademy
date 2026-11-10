# Neon Functions worker cutover

Status: OPEN / IN PROGRESS

Owner: Zyx engineering. On 2026-11-10 the owner explicitly prioritized production worker recovery and deferred staging web/DNS work. Production deployment requires exact target checks, signed Inngest delivery and representative PDF acceptance; registration alone does not establish all 22 business paths.

## Boundaries

The worker is `zyxcompute` on project `muddy-sky-44104897` in Singapore. Staging uses `br-gentle-scene-azq0gp91`; production uses the protected branch `br-wandering-butterfly-azi11h8r`. Deployment requires an explicit environment and checks its exact branch protection and service identities. Inngest retains orchestration, retries, durable steps and schedules. Neon replaces HTTP execution. The 22 primary functions register 25 handlers including three failure handlers.

Web staging remains deferred. Its Cloud Run service has disabled billing; a Vercel staging domain association was prepared but DNS was not changed. The owner explicitly requested production Inngest worker recovery without a web rebuild on 2026-11-10. Do not change Vercel configuration, Zyra chat or Playground for this recovery. Exhausted Deno quota prevents treating it as a working rollback destination.

Worker-only recovery has three compatibility limits. The unchanged web emits source-figure v1 requests; completed v1 assets remain readable, but unfinished requests require the original native renderer or a later producer release. V4 verification requires matching real web and worker runtime identities and remains fail-closed. The deployed web's direct compute RPC still points to its existing endpoint; Inngest registration does not reroute it. Do not copy an old fingerprint onto changed renderer code or claim these paths recovered.

PDF.js extraction, page images, thumbnails and source crops run in Cloudflare Browser Run through Playwright CDP. HTML to PDF reuses the environment's existing diktat renderer and its BROWSER binding. Closing the remote browser session releases its contexts. Browser operations have a 120-second deadline. PDF inputs are limited to 50 MiB. Crops retain rotation handling and the 16-million-pixel guard. Browser version mismatches fail closed. Packaged PDF.js WASM/JavaScript decoders preserve JPEG2000 images; a red-pixel fixture catches silent blank rendering.

Native canvas alone exceeds Neon's 10 MiB compressed archive limit. The build packages Node 24 ESM, Playwright, KaTeX and browser PDF assets, rejects leaked native PDF imports and enforces Neon SDK archive limits. The tested archive is approximately 6 MiB. The module-scoped PostgreSQL pool has at most five connections and is attached to the Neon runtime for idle disconnect handling.

## Guarded deployment

GitHub repository variable `HOLD_WEB_DEPLOYMENT=true` pauses the CI web release and both direct web workflow jobs during worker-only recovery. Owner: Zyx engineering, at the owner's explicit request. Keep it set until an explicitly authorized coordinated web release; remove the hold only for that release. It does not bypass worker checks or change a product feature flag. Vercel Git auto-deployment remains disabled.

The manual `worker-acceptance.yml` workflow takes an explicit environment and a successful worker deployment run ID. It prepares private GitHub environment settings, verifies the downloaded archive identity against live health, and exercises only uniquely owned temporary fixtures. It does not deploy or build the web. Temporary test courses may be visible until cleanup because the schema has no hidden course state. Pending fixtures retain their evidence and are not deleted while jobs may still consume them.

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

Production background Vectorize writes use the existing vector API code in the separate `zyx-vector-api-background` Worker. It binds only `zyx-vectors-production-v2` and `zyx-site-search-production`, with a separate encrypted secret installed atomically. The existing web endpoint and credential are unchanged. GitHub production `BACKGROUND_VECTORIZE_WORKER_URL` and `BACKGROUND_VECTORIZE_SHARED_SECRET` map only into the prepared background runtime; neither is a web setting. The original background credential failed authenticated writes with HTTP 401. Anonymous reads on the new endpoint return 401, and authenticated reads return 200. Do not replay the historical failed outbox without checking cause and current source versions.

Neon and Cloudflare retain metered usage and limits. Reported Neon credit does not establish Cloudflare credit. No plan upgrade is included. The minute outbox cron is retained, so low website traffic does not imply zero invocations. compute.request logs record wall duration and process CPU; overlapping process CPU cannot provide per-job billing attribution.

For staging regression, restore the previous successful Neon archive and matching build identity, then resync Inngest. Preserve pending fixtures until terminal state or explicit cancellation. Suspended Deno is not a verified recovery target. Production requires its own working rollback target before cutover.

## Acceptance checkpoint, 2026-11-10

Production worker-only recovery completed through [workflow run 42828349104](https://github.com/soezyxstt/zyxacademy/actions/runs/42828349104) from revision `ce5ebb7cdc5cce79f1a41e5f45083b0eee64c885`. Neon production `zyxcompute` deployment 1 is active, archive SHA-256 `5a40bcf935062563723b84fb4bcb8cc2ad9c2513f0a599764af17b0a7cdd2d0a`, with 22 primary functions. Production Inngest sync returned HTTP 200. All 10 deployed HTTP/PDF checks passed. The synthetic source-read event `01M72VV54B2ZFSSXQYFRMCWVZ7` completed as run `01M72VV5FEXXP4HMG3HM4D4G2V`; the stored state and extracted text were checked, and owned source/state fixtures were cleaned. This verifies real signed execution, not every business path. Evidence is retained locally under `artifacts/neon-production-recovery-42828349104/production/`.

No web build, Vercel configuration change, Playground change or Zyra chat change was performed. GitHub production received the approved worker RPC secret; the added credentials are retained in the ignored release checkout `.env.prod`, with explicit worker-only scope. The existing web's direct compute RPC, unfinished source-figure v1 requests and V4 verification remain subject to the compatibility limits above. The migration branch remains separate from main; this recovery does not establish that future main releases use the new workflow.

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
