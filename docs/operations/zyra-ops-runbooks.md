# Zyra operations runbooks

Version: `zyra-ops-runbooks-v1`

These runbooks apply to staging and production operations review. They use the privacy-safe alert code only. Never retrieve a prompt, response, raw key, object key, or learner identity to investigate an alert.

## Active reservation spike

Compare active reservations with the accepted allowance and control-plane diagnostics. If the count is not explainable, roll back to the last verified application version, preserve the lease evidence for reconciliation, and note that the allowance ledger no longer has an env kill switch.

## Quota oversubscription

Stop promotion of the affected canary, reconcile application leases with control-plane commits, and roll back to the last verified application version if the invariant is not restored. Never delete lease rows.

## Reconciliation drift

Keep the authoritative allowance ledger enabled, repair only the documented compatibility projection, and rerun reconciliation after the grace period. Escalate if a committed lease is missing or duplicated.

## All projects degraded

Keep new rollout flags off, inspect masked project health and provider outcome buckets, and use the router fallback policy. Roll back to the last verified application version if safe fallback cannot be demonstrated; the router is always-on and has no env kill switch.

## Provider 429 or timeout

Slow or stop the synthetic canary, verify the bounded request cap, and allow health-aware fallback to settle. Roll back to the last verified application version if the accepted text path cannot meet its fallback gate.

## Premium reserve

Stop premium-only experiments and verify that ordinary tutoring still has its declared reserve. Roll back to the last verified application version if reserve accounting is not exact.

## Cache isolation

Stop cache promotion and inspect only cache contract metadata and hashes. Disable `FEATURE_ZYRA_SEMANTIC_CACHE_V1` if a learner, image, assessment, or profile field can enter a shared cache.

## Semantic cache quality

Freeze semantic writes, preserve the calibration artifact, and compare exact scope and profile metadata. Disable `FEATURE_ZYRA_SEMANTIC_CACHE_V1` if false reuse or profile drift is observed.

## Attachment authorization

Disable new image input with `FEATURE_ZYRA_IMAGE_INPUT_V1`, preserve private objects and rows, and inspect only masked scope outcomes. Do not expose or copy the attachment bytes during investigation.

## Image sanitizer

Disable `FEATURE_ZYRA_IMAGE_INPUT_V1` if sanitizer failures exceed the accepted threshold. Keep text tutoring active, retain failed reason codes, and retry only with approved synthetic fixtures.

## Assessment safety

Roll back the deployment and disable image input for the affected canary, preserve the leak-scan artifact, and block active-assessment traffic until the policy and validator fixtures pass again.

## Teaching validation

Keep the typed response boundary fail-closed, inspect stable violation codes, and roll back the deployment if deterministic safe composition is not available.

## Telemetry loss

Keep quota and learner responses authoritative, check database write health and bounded failure counts, and restrict or roll back the operations route if it causes request failures. The dashboard is admin-gated and always-on with no env kill switch. Never replace ledger truth with telemetry estimates.

## Proposal safety

Disable the affected tutor or admin copilot flag, reject pending proposals, and verify that the existing mutation boundary remains fail-closed. Do not apply a proposal while preconditions or audit linkage are uncertain.

## Canonical publication vector recovery

For bundle-managed Ideas, source chunks, Articles, questions and solutions, inspect the exact environment and canonical entity status before any authorized replay. A queue action is historical intent, not authority to republish content. The worker rereads canonical state before embedding and again while holding publication locks for the provider write. An old upsert for withdrawn content becomes a delete; an old delete for an active shared entity is skipped. Completion records the actual operation and indexed content hash.

Dispatch and cron process up to 250 rows per invocation in five independently checkpointed batches, then schedule a durable continuation when eligible work remains. A malformed payload is retained with `VECTOR_SYNC_INVALID_PAYLOAD` and attempts 10, outside automatic retry. Inspect and repair that exact row only with authorization; do not reset unrelated rows or reuse an unvalidated body. Valid rows sharing its batch continue without consuming retries for its error.

Each new Idea or Product import creates its own deterministic outbox IDs and reports the inserted count. A later shared publication does not reuse an exhausted job from another import. Repeating publication of the same import remains idempotent.

Managed jobs require explicit, consistent entity ID and version fields. A missing ID must not be repaired by guessing from the queue ID. After an exhausted provider batch step, the worker splits by vector identity before consuming row attempts. Equal identities stay together; every child rechecks canonical state and its own lease. Independent upserts and deletes complete even when another identity is rejected. Isolation has at most 99 groups for a 50-identity batch; partial provider effects may be repeated idempotently. Remaining failures receive a checkpointed 30-second backoff and retry dispatch. Failed owned rows stop retrying at ten attempts; subsequent pending batches still continue. When processing leases are the only remaining work, a durable wakeup at the earliest expiry recovers abandoned leases without waiting for cron.

Current authoring acceptance covers canonical Idea V3 and learning Product V4/V5. Review and publication can run through scoped MCP tools without opening the Admin website. Legacy compatibility and legacy indexing are retired from this acceptance scope.

Rows in `learning`, `practice`, `past_exams`, `idea` and `product` are quarantined with `VECTOR_SYNC_LEGACY_NAMESPACE_RETIRED` and attempts 10. The worker performs no embedding, upsert or deletion for these rows. Do not replay them into canonical namespaces or infer ownership from a KO foreign key. There is no legacy KO or assessment-object retrieval fallback. Existing legacy rows and remote vectors have not been deleted; cleanup requires explicit authorization for the exact environment and target.

Canonical question mutations queue current question and solution identities transactionally and dispatch after commit. Retired questions and superseded manual solutions queue deletion of their exact versions. Allowed canonical reference snapshots and the separate Admin Ops Knowledge pipeline remain subject to their existing access boundaries.

Embedding runs outside database locks. The provider write and queue finalization hold canonical advisory locks and row locks through commit, so provider latency can delay publication or withdrawal. The lock order is Product identities, Idea identities, compatibility identities, canonical parents and children, then queue leases. A lost provider response is ambiguous; preserve the queue record and retry reconciliation against current canonical state. Do not mark it completed manually or replay its saved payload directly. A changed embedding identity fails the lease for retry rather than writing a stale embedding. Local mock and PGlite checks do not establish live provider ordering or two-session PostgreSQL contention. The managed-row SDK regression exercises real SDK step execution and checkpoint replay, with a simulated coordinator, immediate sleep acknowledgement and local event/provider transports. It does not establish hosted Inngest delivery or timing.

## Admin Ops Knowledge index synchronization

1. Scope and Namespace:
   Admin Ops AI v2 uses the dedicated Cloudflare Vectorize namespace `admin_ops_knowledge` with profile `admin_ops_knowledge_v1` (768 dimensions, cosine similarity metric). It is completely isolated from student tutoring vector namespaces.
2. Synchronization Procedure:
   - When documentation in `docs/` or curated manifests are modified, trigger the synchronization worker via Inngest event `admin/knowledge.sync` or run the smoke check script `bun scripts/staging/smoke-admin-ops-knowledge.ts`.
   - The sync planner computes deterministic differences against `admin_ops_knowledge_sources` and `admin_ops_knowledge_chunks`.
   - Chunks are embedded via `CanonicalContentV2EmbeddingAdapter` (`text-embedding-004`) and upserted in batches. Obsolete chunk vectors are explicitly deleted.
3. Verification:
   Verify that `admin_ops_knowledge_sources` reflects the updated contentHash and chunkCount, and that status is `active`.

## Admin Ops Knowledge index rollback without runtime flag

1. Invariant:
   Knowledge retrieval is always-on for admin surfaces and does not rely on runtime feature flags.
2. Rollback Procedure:
   - To roll back a corrupted or incorrect document, revert the markdown source file in the repository to its prior verified commit.
   - Run the synchronization workflow (`bun scripts/staging/smoke-admin-ops-knowledge.ts --apply`).
   - The sync planner automatically marks the newer chunks as `stale`, deletes their vector IDs from the `admin_ops_knowledge` namespace, and restores the prior content chunks as `active`.
   - If emergency catalog cleanup is required, invoke `markChunksStale()` in `admin-knowledge-store.ts` for the affected source ID.

## Gemini model failure and provider timeout mitigation

1. Key Rotation and Health Pool:
   Admin Ops AI v2 utilizes the multi-key pool (`GeminiKeyPool`) across configured environment slots.
2. Error Handling Codes:
   - In case of HTTP 429 or quota exhaustion, the runtime emits typed error code `RATE_LIMITED` with `retryable: true`.
   - In case of provider network timeouts or 5xx server errors, the runtime emits `PROVIDER_UNAVAILABLE` with `retryable: true`.
3. Client Resilience:
   The UI panel displays actionable Indonesian guidance with a retry action button. If provider degradation persists, admins can execute operational tasks manually through standard admin dashboard routes listed in the catalog.

## Admin action proposal retention and expiration policy

1. Lifecycle and TTL:
   - Action proposals generated via Ops AI tools are initially created in `pending` (or `draft`) status with an authoritative expiration TTL of 30 minutes.
   - Proposals not confirmed by an authenticated admin within 30 minutes transition automatically to `expired`.
2. Replay and Precondition Protection:
   - Once executed, proposals cannot be re-executed. A duplicate execution request returns the previously recorded result idempotently without re-triggering side effects.
   - Live preconditions (such as course existence) are verified immediately prior to execution; if preconditions drift, the execution fails with `STALE_PRECONDITION`.
3. Retention and Archival:
   Records in `zyra_proposals` and `ops_ai_mutation_audit` are immutable audit trails. Expired and cancelled proposals must be retained for at least 90 days for compliance before automated cold storage archiving.
