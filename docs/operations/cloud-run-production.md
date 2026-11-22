# Cloud Run production migration

Status: production schema through 0038 verified on 2026-11-21. Cloud Run currently serves the previous release; the promoted main release is pending deployment.

## Verified inventory, 2026-11-20

- Repository `soezyxstt/zyxacademy`, main `8b158bf9f3e419b1dd8fbfed56bcf5413e703f8f`, promoted by PR 366. The original development checkout remains separate.
- Google project `zyx-academy`, number `307641710075`, with billing enabled. The production identities, Artifact Registry repository, empty secret resources and bootstrap Cloud Run service have been provisioned. The bootstrap has no application credentials or public domain routing. Both production queues are paused; production Scheduler has not been enabled.
- Staging web runs in `asia-southeast3`. Two obsolete image digests and their unused revisions were deleted after verifying the active edge candidate, default service traffic and one rollback candidate. Those serving and rollback identities remain intact. Storage accounting can lag deletion. Fifteen staging Secret Manager secrets exist, with numeric version references in the web configuration.
- Existing Tasks queues `zyx-staging-default` and `zyx-staging-pdf`, and Scheduler job `zyx-staging-dispatcher`, are in `asia-southeast1`. Cloud Tasks rejected `asia-southeast3` as an unsupported location.
- A pinned read-only connection verified production Neon host `ep-quiet-math-azyey0mb-pooler.c-3.ap-southeast-1.aws.neon.tech`, database `neondb`. The migration ledger contains nine entries, through timestamp `1794585056992`. The queue checkpoint, compact-history readiness, and discussion channel tables are absent.
- The current production ledger contains a historical migration hash different from staging. Preserve the actual production ledger; never replace it with the staging baseline.
- Repository `HOLD_WEB_DEPLOYMENT=true` blocks automatic production web and worker deployments. Keep it set while preparing this migration.

## Production targets

| Resource | Exact target and configuration |
|---|---|
| Web | Cloud Run `zyx-academy-production-web`, `asia-southeast3`, request billing, minimum 0, service maximum 1, 1 vCPU, 1 GiB, concurrency 8, 300-second timeout, startup CPU boost disabled |
| Public origin | `https://www.zyxacademy.com`, with apex redirect preserved and a dedicated production Cloudflare edge using the existing authenticated origin gateway |
| Runtime identity | `zyx-production-web-runtime@zyx-academy.iam.gserviceaccount.com`, limited to its own runtime secrets, production queues, and queue sender identity |
| Default queue | `zyx-production-default`, `asia-southeast1`, dispatch concurrency 1, at most 1 dispatch per second, 6 attempts, 30 to 300-second backoff |
| PDF queue | `zyx-production-pdf`, `asia-southeast1`, dispatch concurrency at most 2, at most 1 dispatch per second, 3 attempts, 30 to 300-second backoff |
| Queue sender | `zyx-production-queue@zyx-academy.iam.gserviceaccount.com`, OIDC audience bound to the exact production consumer origin |
| Consumer | Existing production Neon Functions `br-wandering-butterfly-azi11h8r-zyxcompute`, with `QUEUE_PROVIDER=cloud-tasks` and the matching web revision |
| Scheduler | One `zyx-production-dispatcher` job, `asia-southeast1`, `0 */6 * * *`, UTC, authenticated POST to the production consumer `/internal/cron/tick` |
| Database and storage | Existing protected production Neon branch `br-wandering-butterfly-azi11h8r`, database `neondb`, private bucket `zyx-production` |

Normal outbox writes wake work immediately. The consolidated six-hour dispatcher is a recovery path; stranded work can wait up to six hours. The existing analytics web handler is invoked through the registered midnight job using the compute credential, preserving the legacy cron credential during transition. Analytics provider dependencies remain in the web runtime.

## Cost boundary

The user explicitly authorized necessary non-Neon charges after requesting cleanup of unused artifacts. Keep scale-to-zero and the bounded instance, dispatch and retry settings above. These limits reduce costs but do not guarantee zero charges:

- [Cloud Run](https://cloud.google.com/run/pricing) has shared monthly CPU, memory, and request allowances. Maximum instances limits concurrency, not monthly billable usage. Bangkok internet responses through the Cloudflare edge can incur egress charges independently of Neon traffic.
- [Cloud Tasks](https://cloud.google.com/tasks/pricing) includes one million monthly operations. Creation, delivery, retries, and 32 KB chunks count. Dispatch rate limits do not impose a monthly spending cap.
- [Cloud Scheduler](https://cloud.google.com/scheduler/pricing) includes three jobs per billing account. One staging and one production dispatcher fit only if no other account projects consume the remaining allowance; paused jobs still count.
- [Artifact Registry](https://cloud.google.com/artifact-registry/pricing) includes 0.5 GiB-month per billing account. Initial storage was above that steady-state allowance. Two verified unused images were deleted, while the active and rollback images were preserved. A new production image adds storage.
- [Secret Manager](https://cloud.google.com/secret-manager/pricing) includes six active secret versions per billing account. Adding a production copy of the fifteen-secret staging pattern increases ongoing billable versions. Disabled versions still count. Do not destroy existing versions as part of an unreviewed quota cleanup.
- [Cloud Run spend caps](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps) are available, but apply to estimated gross costs before savings and credits, may overshoot during enforcement delay, and do not cap Tasks, Scheduler, registry, or Secret Manager. They cannot establish a universal zero-charge guarantee. The Budget API is currently disabled in this project; no budget was created or changed.

No numeric spending ceiling was requested after paid operation was authorized. Do not promise a hard overall cap.

## Completed schema safeguards

The guarded runner is `scripts/production/cloud-run-migration.ts`. It pins the exact production nine-row ledger and all 37 committed migration blobs and timestamps. Its read-only check distinguishes pending from already complete, and the deployment preflight rejects pending schemas. Applying requires an explicit writer-fenced marker and independent target metadata in `scripts/production/cloud-run-source.json`.

Neon backup branch `br-late-glitter-azyzt5ez` was created from production before changes. Rehearsal branch `br-twilight-darkness-azpf448u` used a separate direct endpoint. All 28 pending migrations, compact-history backfill for 112 existing attempts, and the 39-entry cosmetic seed executed successfully inside a PostgreSQL transaction and were rolled back. Production remains unchanged. Preserve the backup through cutover acceptance; the disposable rehearsal endpoint may be removed afterward.

The runner uses transaction locks and bounded timeouts, preserves existing ledger hashes, verifies schema prerequisites and readiness, and verifies a completed rerun. An uncertain commit response requires an independent read-only check before any retry.

## Remaining implementation and release gates

1. Merge the guarded production build, runtime, origin, edge and queue changes after checks pass. Dispatch `deploy-cloud-run-production.yml` from `main` for inventory, candidate, promotion, or rollback. Promotion and rollback require an exact revision.
2. Populate numeric production secret versions from the verified GitHub production environment. Local `.env.prod` still points to legacy Turso, so it must not be used as the production database source. Do not copy staging credentials, browser public configuration, identities, or storage targets.
3. Inspect the production Vercel control plane using the manual `inventory` operation. Inngest is no longer used and is not queried during production deployment inventory. Verify the external fences before applying the rehearsed schema. Offline tests and a disposable rehearsal alone do not establish production acceptance.
4. Fence every old web, API, MCP, worker and cron writer before the production migration.
5. Deploy and test the matching consumer before enabling the production producer and Scheduler. Test unauthenticated denial, one owned synthetic task, stable retry identity, private storage, existing session continuity, and recovery. Remove owned fixtures.
6. Switch public traffic only after the candidate and schema gates pass. Preserve the previous host, immutable image and worker rollback identities. Disable old scheduling only after proving the replacement, without running both schedules concurrently.

The public DNS and worker routes, production schema, legacy writer state and production application deployment remain unchanged at this preparation stage.

## Schema update, 2026-11-21

Production already contained 37 ledger entries through 0036. Migrations 0037 and 0038 were rehearsed on `br-hidden-rice-azq54qqa`, cloned from backup `br-spring-recipe-aznzg7ii`, then committed together to production `br-wandering-butterfly-azi11h8r`. The transaction checked the exact existing ledger and schema under an advisory lock and exclusive locks on the ledger and two affected tables, with a 10-second lock timeout and 60-second statement timeout. Historical ledger rows and existing profile visibility values were preserved.

Independent readback confirmed 39 ledger entries, the `members` default and nullable JSONB `mention_handles`. The updated Cloud Run read-only gate returned `already complete` using the production runtime credential. Its 16 focused offline tests passed. The gate pins all 39 committed migration blobs and rejects a 37- or 38-entry ledger; incremental application from those states remains an operator-controlled transaction, not the historical baseline runner. Preserve the backup through release acceptance.
