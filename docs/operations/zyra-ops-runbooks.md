# Zyra Operations Runbooks

Version: `zyra-ops-runbooks-v2`

These runbooks apply to staging and production operations review. Investigate alerts using only privacy-safe alert codes and masked diagnostics. Never retrieve a prompt, response, raw API key, object key, or learner identity during incident triage.

## Active reservation spike

Compare active reservations against the configured allowance cap and `workers/zyra-control-plane` diagnostics. If the count cannot be explained by normal traffic, roll back to the last verified application version and preserve lease rows for reconciliation. The allowance ledger is always-on and has no env kill switch.

## Quota oversubscription

Stop promotion of the affected release, reconcile application leases against control-plane commits, and roll back to the last verified application version if the invariant is not restored. Never delete lease rows.

## Reconciliation drift

Keep the authoritative allowance ledger active, repair only the documented compatibility projection, and rerun reconciliation after the grace window. Escalate if any committed lease is missing or duplicated.

## All projects degraded

Inspect masked provider/alias health and outcome buckets in `/admin/ops/models` and `/admin/ops/analytics`. Confirm Cloudflare AI Gateway (`CF_AI_GATEWAY_URL`, `CF_AI_GATEWAY_TOKEN`) reachability and verify that healthy fallback aliases are configured. Three consecutive failures trigger an automatic 5-minute alias cooldown. Roll back to the last verified application version if safe fallback cannot serve text traffic.

## Provider 429 or timeout

Verify bounded request caps, inspect alias cooldown state in `/admin/ops/models`, and allow health-aware fallback across configured BYOK aliases and query-key fallbacks to settle. Trigger a manual 3-sample median latency probe only after upstream pressure subsides.

## Premium reserve

Pause premium-tier experiments and verify that standard student tutoring retains its declared daily reserve (15 to 18 turns per Jakarta day depending on rank). Roll back if reserve accounting drifts.

## Cache isolation

Stop cache promotion and inspect only cache contract metadata and hashes. Disable `FEATURE_ZYRA_SEMANTIC_CACHE_V1` immediately if any learner, image, assessment, or profile field can enter a shared cache.

## Semantic cache quality

Freeze semantic writes, preserve calibration metadata, and compare scope and profile hashes. Disable `FEATURE_ZYRA_SEMANTIC_CACHE_V1` if false reuse or scope drift is observed.

## Attachment authorization

Disable learner image input via `FEATURE_ZYRA_IMAGE_INPUT_V1` (and `NEXT_PUBLIC_FEATURE_ZYRA_IMAGE_INPUT_V1`), preserve private storage objects and database rows, and inspect only masked scope outcomes. Do not copy or expose attachment bytes.

## Image sanitizer

Disable `FEATURE_ZYRA_IMAGE_INPUT_V1` if sanitizer rejections exceed the accepted threshold. Keep text tutoring active, retain masked failure reason codes, and retest only with approved synthetic fixtures.

## Assessment safety

Roll back the affected deployment, disable image input if involved, preserve leak-scan evidence, and block active-assessment traffic until `tests/contracts/assessment-redaction.test.ts` and policy validators pass.

## Teaching validation

Keep the typed response boundary fail-closed, inspect stable violation codes in `zyra_operational_events`, and roll back if deterministic safe composition is unavailable.

## Telemetry loss

Keep quota and learner responses authoritative, verify PostgreSQL write health for `zyra_operational_events`, and restrict or roll back the operations route if it causes request failures. The `/admin/ops/analytics` dashboard is admin-gated and always-on. Never replace ledger truth with telemetry estimates.

## Proposal safety

Reject pending proposals in `zyra_proposals`, verify that the mutation confirmation boundary remains fail-closed, and do not apply any proposal while preconditions or audit linkage are uncertain.

## Canonical publication vector recovery

For bundle-managed Ideas, source chunks, Articles, questions, and solutions, inspect the exact environment and canonical entity status before any authorized replay:

- A `vector_sync_queue` row represents historical intent, not authority to republish. Workers reread canonical state before embedding and again under advisory locks before provider writes. An old upsert for withdrawn content becomes a delete; an old delete for an active shared entity is skipped.
- Dispatch and cron process up to 250 rows per invocation in five checkpointed batches and schedule a durable continuation when eligible work remains.
- Malformed payloads stop at `VECTOR_SYNC_INVALID_PAYLOAD` (attempts 10) without blocking healthy sibling rows.
- Provider batch failures split by vector identity so independent upserts/deletes complete while failing identities back off (30 seconds, up to 10 attempts).
- Legacy namespaces (`learning`, `practice`, `past_exams`, `idea`, `product`) are retired and quarantined (`VECTOR_SYNC_LEGACY_NAMESPACE_RETIRED`). Do not replay them into `canonical-content-v2`.

## Admin Ops Knowledge index synchronization

1. **Scope and namespace**: Admin Ops AI uses the dedicated Cloudflare Vectorize namespace `admin_ops_knowledge` (768 dimensions, cosine similarity), completely isolated from student tutoring namespaces. Curated sources are defined in `CURATED_ADMIN_KNOWLEDGE_ALLOWLIST` (`lib/admin-ops-ai/admin-knowledge-sources.ts`).
2. **Local index rebuild**: Whenever documentation under `docs/` or `AGENTS.md` changes, rebuild the precomputed fallback index:
   ```bash
   bun run build:ops-docs
   ```
3. **Remote vector sync**: Trigger the synchronization worker via event `admin/knowledge.sync` (or `bun scripts/staging/smoke-admin-ops-knowledge.ts` on verified staging). Obsolete chunk vectors are deleted automatically.
4. **Verification**: Confirm `admin_ops_knowledge_sources` reflects the updated `contentHash`, `chunkCount`, and `active` status.

## Admin Ops Knowledge index rollback without runtime flag

Knowledge retrieval is always-on for admin surfaces with no runtime feature flag:
1. Revert the affected markdown file in Git to its prior verified commit and run `bun run build:ops-docs`.
2. Re-run synchronization (`admin/knowledge.sync` or `bun scripts/staging/smoke-admin-ops-knowledge.ts --apply`) so newer chunks are marked `stale`, deleted from Vectorize, and prior chunks are restored.
3. For emergency cleanup, invoke `markChunksStale()` in `lib/admin-ops-ai/admin-knowledge-store.ts` for the affected source ID.

## AI Gateway and provider failure mitigation

1. **Routing and cooldowns**: All LLM traffic routes through Cloudflare AI Gateway with dynamic catalog discovery (12-hour KV cache, 14-day stale-usable window) and per-feature or global model selection in `/admin/ops/models`. Three consecutive failures place a provider alias into a 5-minute cooldown while healthy aliases serve traffic.
2. **Typed errors**: Quota exhaustion emits `RATE_LIMITED` (`retryable: true`); upstream timeouts/5xx emit `PROVIDER_UNAVAILABLE` (`retryable: true`).
3. **Manual fallback**: If provider degradation persists, switch the affected feature's model/alias in `/admin/ops/models` or perform admin operations directly via standard `/admin` routes.

## Admin action proposal retention and expiration policy

1. **TTL**: Action proposals in `zyra_proposals` expire automatically after 30 minutes if not confirmed by an authenticated admin.
2. **Idempotency and preconditions**: Executed proposals cannot re-run; duplicate requests return the recorded result idempotently. Live preconditions are checked immediately before execution and fail with `STALE_PRECONDITION` on drift.
3. **Audit retention**: `zyra_proposals` and `ops_ai_mutation_audit` are immutable audit trails; retain records for at least 90 days before archival.
