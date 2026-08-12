# Zyra operations runbooks

Version: `zyra-ops-runbooks-v1`

These runbooks apply to staging and production operations review. They use the privacy-safe alert code only. Never retrieve a prompt, response, raw key, object key, or learner identity to investigate an alert.

## Active reservation spike

Compare active reservations with the accepted allowance and control-plane diagnostics. If the count is not explainable, disable `FEATURE_ZYRA_ALLOWANCE_V2` and preserve the lease evidence for reconciliation.

## Quota oversubscription

Stop promotion of the affected canary, reconcile application leases with control-plane commits, and disable `FEATURE_ZYRA_ALLOWANCE_V2` if the invariant is not restored. Never delete lease rows.

## Reconciliation drift

Keep the authoritative allowance ledger enabled, repair only the documented compatibility projection, and rerun reconciliation after the grace period. Escalate if a committed lease is missing or duplicated.

## All projects degraded

Keep new rollout flags off, inspect masked project health and provider outcome buckets, and use the router fallback policy. Disable `FEATURE_ZYRA_PROVIDER_ROUTER_V2` if safe fallback cannot be demonstrated.

## Provider 429 or timeout

Slow or stop the synthetic canary, verify the bounded request cap, and allow health-aware fallback to settle. Disable `FEATURE_ZYRA_PROVIDER_ROUTER_V2` if the accepted text path cannot meet its fallback gate.

## Premium reserve

Stop premium-only experiments and verify that ordinary tutoring still has its declared reserve. Disable `FEATURE_ZYRA_ALLOWANCE_V2` for the affected canary if reserve accounting is not exact.

## Cache isolation

Stop cache promotion and inspect only cache contract metadata and hashes. Disable `FEATURE_ZYRA_SEMANTIC_CACHE_V1` if a learner, image, assessment, or profile field can enter a shared cache.

## Semantic cache quality

Freeze semantic writes, preserve the calibration artifact, and compare exact scope and profile metadata. Disable `FEATURE_ZYRA_SEMANTIC_CACHE_V1` if false reuse or profile drift is observed.

## Attachment authorization

Disable new image input with `FEATURE_ZYRA_IMAGE_INPUT_V1`, preserve private objects and rows, and inspect only masked scope outcomes. Do not expose or copy the attachment bytes during investigation.

## Image sanitizer

Disable `FEATURE_ZYRA_IMAGE_INPUT_V1` if sanitizer failures exceed the accepted threshold. Keep text tutoring active, retain failed reason codes, and retry only with approved synthetic fixtures.

## Assessment safety

Disable `FEATURE_ZYRA_PEDAGOGY_V3` and image input for the affected canary, preserve the leak-scan artifact, and block active-assessment traffic until the policy and validator fixtures pass again.

## Teaching validation

Keep the typed response boundary fail-closed, inspect stable violation codes, and disable `FEATURE_ZYRA_PEDAGOGY_V3` if deterministic safe composition is not available.

## Telemetry loss

Keep quota and learner responses authoritative, check database write health and bounded failure counts, and disable `FEATURE_ZYRA_AI_OPS_V1` if the operations path causes request failures. Never replace ledger truth with telemetry estimates.

## Proposal safety

Disable the affected tutor or admin copilot flag, reject pending proposals, and verify that the existing mutation boundary remains fail-closed. Do not apply a proposal while preconditions or audit linkage are uncertain.
