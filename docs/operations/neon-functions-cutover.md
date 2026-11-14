# Neon Functions worker cutover

Status: OPEN / IN PROGRESS

V4 release exception, 2026-11-11: the owner authorized one coordinated web release for simplified verification and publication of Matematika I Bab 1. That release retires the temporary web/worker source bridge and uses exact-draft GitHub Actions verification with pinned Chromium, bounded screenshots and the existing signed-evidence/publication gates. Playground and Zyra code/configuration remain outside scope. This source record does not establish deployment or publication completion.

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

## Production main integration, 2026-11-10

Workflow integration is complete in [PR 309](https://github.com/soezyxstt/zyxacademy/pull/309), main revision `dd1fadc7e034c7e9bd0510ac3321429f7792fe22`. [Main CI and production release 42845350696](https://github.com/soezyxstt/zyxacademy/actions/runs/42845350696) passed all selected checks and deployed Neon production `zyxcompute` deployment 3, archive `8cd8eb90b40c54eb65e845cf9cf7dc7171e96350d10334f646d2fd720aa7786b`. Its 10 HTTP/PDF checks passed, including durable source-read run `01M732FGY0W7D26HANNVH430W8`. Inngest registers 22 primary functions. The web deployment job was skipped under the explicit hold. Vercel production remained on `dpl_6q9mwweTtbdtUnUvkcUozowGFaPf`.

Production fixture acceptance covered source reads, thumbnails, all-correct quiz feedback, source-figure v2, full Diktat plus thumbnail, Idea mastery with replay idempotency, quiz analytics, question generation, bulk flashcards/draft material, and canonical vector upserts/deletes. The empty admin outbox cron also completed real scheduled runs. The initial business evidence is [run 42837015464](https://github.com/soezyxstt/zyxacademy/actions/runs/42837015464); resumed learning/content acceptance passed in [run 42842072297](https://github.com/soezyxstt/zyxacademy/actions/runs/42842072297). Both retained fixture courses were deleted after verified completion and their absence was checked read-only. Content-addressed synthetic PDF cache entries may remain.

This is not acceptance of every branch of all 22 functions. Assessment ingestion and global/email schedules were not forced; the unchanged web's V4, source-figure v1 and direct RPC limits remain. A read-only audit found 2,083 historical failed vector outbox rows, including rate-limit and authentication failures. They were not blindly reset or replayed. The background writer authentication fault was repaired using separate worker-only settings, without rotating the live web credential or changing the shared AI Gateway. Remaining acceptance stays OPEN / IN PROGRESS. PR 308 was closed as superseded; its graph changes remain unreleased.

## Historical vector recovery and remaining acceptance

The production inventory contains 1,128 Idea rows, 899 source-chunk rows and 56 article operations. Eleven Idea rows refer to superseded versions. Fifteen withdrawn articles each have an upsert and a delete. Recovery performs 2,042 current-source upserts and 26 exact-version deletions, resolving all 2,083 original rows while retaining original payloads, actions, attempts and historical errors. Three published articles changed after enqueueing; recovery embeds current stored content and excludes the existing visual metadata suffix.

`scripts/neon/recover-vector-backlog.ts plan|apply|verify vector-recovery-<UUIDv4>` requires the pinned production runtime and deployed archive identity. Plan saves and reads back an immutable queue/source snapshot in the private production bucket. Apply compares a two-document batch with corresponding singleton embeddings, saves previous vectors and reusable embedding checkpoints privately, claims rows with payload/attempt/lease guards, and verifies vector values, identities, metadata, dimensions and deletion absence before completion. Current sources are rechecked before and after each write. Resume uses the same recovery ID. Only an expired lease owned by that ID can be recovered. Document content and credentials are excluded from public workflow artifacts.

The normal vector worker uses a worker-only batch helper with separate durable embedding and write steps. Public batches contain at most 50 documents and provider requests split at 25. It reserves at most 75 documents per project per rolling minute and starts HTTP requests at least 5 seconds apart per process, including failover. The shared gateway stays unchanged. Inngest and maintenance concurrency still matter across processes. The model, canonical serialization, 768-dimensional profile, web adapter and Zyra configuration stay unchanged.

Manual `deploy.yml` maintenance modes `vector-plan`, `vector-apply`, `vector-verify` and `remaining` skip worker deployment and all web builds. Supply the successful `deployment_run_id` for the exact active archive and the same `recovery_id` across vector phases. `remaining` runs owned search/mastery fixtures and normal deterministic mastery-history, course-analytics and content-quality recomputations. It verifies stored outputs and exact owned search-vector deletion, retaining fixtures on failure. Email delivery, assessment ingestion, product-bundle PDF and admin knowledge synchronization need separate acceptance evidence. Runtime results for these new commands remain pending until recorded below.

Provider ID compatibility is required for 17 historical rows: Vectorize accepts at most 64 UTF-8 bytes per physical ID. The API maps longer canonical IDs to a full SHA-256 storage key and restores the canonical ID from verified metadata on get, query and paginated list. Short IDs, shared secrets, bindings, the canonical profile and application contracts stay unchanged. Prefix list callers must follow cursors across empty filtered pages. Direct Wrangler reconciliation sees physical IDs and fails closed; use the canonical HTTP API. Once hashed records exist, rollback must preserve this API mapping.

Both the background and shared API mappings are deployed after explicit user approval. The 17 long-ID rows passed the same independent verification as the other recovered rows. Partial short-ID recovery remains available for diagnosis using the same immutable snapshot and per-batch private checkpoints. Separate acceptance scripts cover owned product-bundle PDFs, course-scoped assessment extraction with exact created-concept provenance, and normal curated Admin Knowledge synchronization for 275 chunks. Runtime results are recorded below.

## Runtime follow-up, 2026-11-11

[PR 311](https://github.com/soezyxstt/zyxacademy/pull/311) merged as `8cb083876373e1fb49874f6679a25425c91d1903`. [Main release 42866549218](https://github.com/soezyxstt/zyxacademy/actions/runs/42866549218) passed and deployed production 4, archive `07abcfc2df147b651297f956f636e56c31d93639ef4265fb946609d96368b959`, with 22 registered functions and all 10 HTTP/PDF checks passing. Web build/deployment remained skipped. Product-bundle PDF acceptance passed in [run 42860375559](https://github.com/soezyxstt/zyxacademy/actions/runs/42860375559): real one-page PDF bytes, authored text, repeated-download hash, lineage and exact owned cleanup were verified.

Runtime acceptance exposed a separate Gemini Free Tier quota of 100 individual embedding documents/minute/project. A batch of 50 documents consumes 50, even though the gateway counts one HTTP request. The worker-only helper now splits requests at 25 documents, reserves at most 75 documents per project per rolling minute, retains 5 second global HTTP pacing, disables 401/402/403 clients for the process and applies bounded 60 second cooldowns after HTTP 429. Reservations remain process-local; provider backoff protects concurrent instances. This does not change shared gateway settings, keys, model routing or the web adapter.

The analytics cron returned one business failure while its run completed. A guarded `BEGIN READ ONLY` probe identified `ma1101`: five short-answer text snapshots reached an array-only `.every` call. The existing short-answer and stable-option graders now handle supported answer formats; unsupported or malformed grading shapes are excluded from correctness denominators. PGlite regression tests passed, and all seven active production courses reached the final deliberately blocked snapshot insert in read-only diagnosis. This verifies computation against live shapes without writing their snapshots. Worker runtime confirmation of this follow-up remains pending.

Automatic review initially blocked the shared API and search metadata changes pending explicit user approval. The approvals and verified recovery are recorded in the following checkpoint. Recovery retains private original-row snapshots, previous-vector backups and embedding checkpoints, and records completion only after independent readback. The temporary drain branch can stage short-ID writes before a separate verification pass; staging alone does not complete a queue row.

## Full outbox recovery checkpoint, 2026-11-11

The user approved the shared Vector API encoding repair, all three search metadata indexes, and production analytics/quality verification. The shared API deployed as version `90849190-fde8-452f-8cee-6e195f16f514`, preserving its existing bindings and encrypted credential. Search now has `min_role:number`, `course_id:string` and `entity_type:string`. All 349 existing search vectors were replayed with unchanged values/access metadata after salted source-fingerprint checks; no new embeddings were requested. Public/admin role filtering passed, and removing the owned test vector left 348 active vectors. Exact provider readback confirmed that fixture absent.

[Recovery 42871644102](https://github.com/soezyxstt/zyxacademy/actions/runs/42871644102) resolved all 2,083 original rows. It independently verified 2,042 current-source upserts and 26 unique deletions, retaining original queue payloads/actions/attempts and private recovery snapshots. The production queue had zero failed/processing entries; its extra completed row belongs to the isolated assessment acceptance fixture. Snapshot SHA-256: `a7b957c57726974cbd895a09ff1d5be4a81c7135fc84e29948ab8334605045b0`. These are verified completions, not a blind status reset.

[PR 312](https://github.com/soezyxstt/zyxacademy/pull/312), main `ef4f5565de5456ddb2457ed7038d62b6dd243afe`, released production 5 in [run 42869565096](https://github.com/soezyxstt/zyxacademy/actions/runs/42869565096), archive `62409e3184e697f0440c7af2f463687b6942c5c8bcf45acfd1b640e8301fa7e7`. CI, 22 function registration and all 10 HTTP/PDF checks passed; web deployment stayed skipped.

Assessment ingestion completed its real owned source, but its first smoke observed terminal status before output persistence. Resume now verifies the same owned fixture and hashes and reuses the original run without creation, ingestion or vector dispatch. It retains exact newly created global concept/localization IDs for reviewed cleanup. The shared run reader waits for persisted output before completing acceptance. Admin Knowledge's actual `SOURCE_READ_FAILED` exposed a separate archive-root issue: the docs are packaged next to `index.mjs`, while Neon cwd differs. The job now resolves its curated base directory from its module URL only on Neon; other hosts retain their existing behavior. Runtime acceptance for this final patch remains pending.

## Production recovery results, 2026-11-11

[PR 313](https://github.com/soezyxstt/zyxacademy/pull/313) merged as `0eeae12b039b9a4f46d34a8489eb429f6dba34d6`. [Release 42878067706](https://github.com/soezyxstt/zyxacademy/actions/runs/42878067706) deployed production 6, archive `9ddcd785f3bb57dccbaabbdffec27c023e50af3181e3cdb892224e41f1c8c8e9`. All 10 HTTP/PDF checks passed, 22 functions remain registered, and the web deployment job was skipped. Vercel production remains `dpl_6q9mwweTtbdtUnUvkcUozowGFaPf`; Playground and Zyra code/configuration were not changed. The approved shared Vector API encoding repair is the only change to that shared retrieval boundary.

[Remaining-worker acceptance 42876205563](https://github.com/soezyxstt/zyxacademy/actions/runs/42876205563) passed real search sync, mastery recomputation and idempotency, mastery snapshots, course analytics and quality auditing. Analytics built 7/7 active courses with zero failures; quality auditing processed all seven without failures. Search access filtering and exact owned vector deletion passed. Its owned fixture graph was removed and its course/vector absence independently confirmed.

[Assessment resume 42879066369](https://github.com/soezyxstt/zyxacademy/actions/runs/42879066369) passed against the original completed extraction run `01M739D273Q2ZPN9N1MGB6XW67`, without recreating fixtures or repeating AI/dispatch. It verified the extracted question/answer, profile, policy, concept evidence, content hash and 768-dimensional vector. Reviewed cleanup checked every foreign key referencing concepts, locked exact concept rows, rechecked zero unowned references, deleted the exact vector and verified absence before removing the owned fixture graph and its one newly created concept/localization. The queue is now exactly 2,083 completed original rows, with no pending, processing or failed rows.

Admin Knowledge's real run `01M73CQC6KFMB095K12FATXX6N` completed with 15 active sources and 275 active chunks. [Its initial acceptance 42879060227](https://github.com/soezyxstt/zyxacademy/actions/runs/42879060227) passed catalog and exact-vector checks, then failed an extra enumeration check because the Cloudflare binding lacks `list`. Independent authenticated readback verified all 275 vector identities, hashes, dimensions and admin access metadata. Separate Cloudflare management API enumeration across three pages matched exactly those 275 admin IDs, with no missing or extra admin vectors. The portable acceptance now checks active vectors and exact obsolete IDs from the durable pre-sync catalog through `get`, without requiring unsupported binding enumeration.

[Portable Admin Knowledge acceptance 42880801417](https://github.com/soezyxstt/zyxacademy/actions/runs/42880801417) passed on the existing production 6 archive. Run `01M73DAMK563J0PKYQE3D8A49J` completed, verifying all 15 sources, 275 chunks and 275 vectors. The repeated sync reported all sources/chunks unchanged, no upserts/deletes and no new embeddings. No deployment or web build was performed by this acceptance.

Ordinary tested background paths are recovered. This does not certify every branch of all 22 functions. Reflection email delivery and the incorrect-answer feedback branch were not forced. The unchanged web's V4 runtime binding, unfinished source-figure v1 and direct compute RPC limits above still require coordinated compatibility work or a later authorized web release. Staging remains deferred, and no paid Deno upgrade or shared AI Gateway limit increase was made.

## Bab 1 V4 compatibility bridge

Status: `OPEN / IN PROGRESS`. The worker-only bridge is restricted to the existing Matematika I Bab 1 draft import, bundle and course. It rejects source figures rather than certifying unsupported v2 figures against the unchanged reader. Other V4 bundles retain the ordinary runtime comparison.

The target web fingerprint was observed on the public production verification page with Playwright and matched to its immutable JavaScript asset checksum. The source revision is `75e27c0b265eb4f364efc413d9d5bd40c468dcaa`, observed Vercel deployment `dpl_6q9mwweTtbdtUnUvkcUozowGFaPf`. The compatibility manifest pins the complete reviewed source closure, packages and deployment scripts. Worker builds reject changed or missing source pins; production deployment rejects a changed public web asset. The actual executor fingerprint is embedded in the worker archive and independently compared with its runtime environment. It is never replaced by the web fingerprint.

The derived plan continues to identify the actual target web renderer. Every web check still compares the loaded page's runtime with that plan. The structure result records both identities, source pins and executor archive checksum in a JSON artifact covered by the normal signed receipt. Dependency, content, attempt, browser, PDF, review and publication gates remain enforced. Font, playbook, print profile and Cloudflare browser identity must remain compatible. The contract fingerprint differs because of the reviewed source-figure adapter; source figures are excluded from this bridge.

Owner: Zyx engineering. Removal condition: an authorized coordinated web/worker release with matching runtime identities. Rollback: remove the scoped bridge and reverify with a matching executor; previous mismatched evidence cannot make the draft ready. No feature flag, web build, Playground or Zyra configuration change is included. Live V4 acceptance remains pending until its exact receipt and review are recorded.
