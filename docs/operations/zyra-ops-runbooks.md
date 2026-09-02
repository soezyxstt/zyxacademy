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
