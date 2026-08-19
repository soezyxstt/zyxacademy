# Legacy Vector Contract Allowlist

This allowlist documents non-runtime matches that may remain while the staging cutover is completed. It does not authorize new provider writes, production deletion, or use of a legacy vector source as canonical content.

| Surface | Allowed match | Reason and boundary |
| --- | --- | --- |
| `db/schema.ts` | Historic vector status and ID columns | Preserved migration history. New canonical writes use `vector_sync_queue` and canonical Vectorize IDs. The columns are not retrieval authority. |
| `app/api/admin/material-instances/**` | Old material route adapters and read fields | Compatibility surface for old URLs. Canonical queue records are the only active vector work; Plan 016 inventory must report zero runtime provider callers. |
| `app/actions/tutor-management.ts` | Legacy tutor material compatibility surface | Kept for old route compatibility until the replacement workflow is deployed. It must not call a legacy provider or write a provider index. |
| `app/(admin)/admin/ai/(content)/materials/**` | Historical status display fields | Compatibility UI for preserved material rows. It is not an indexing authority. |
| `scripts/test-onboarding-blockers.ts` | Legacy fixture fields | Deterministic test data only; never executed as a staging migration or production writer. |
| `docs/audit/**` | Historical audit references | Historical documentation describing the pre-cutover architecture. |
| `scripts/staging/decommission-pinecone.ts` | Exact staging decommission control | The only external deletion utility. It requires an exact staging target, a fingerprint, mutation guard, and operator confirmation. |
| `scripts/staging/decommission-pinecone.ts` with `--not-provisioned` | Staging absence evidence | Used when staging never provisioned Pinecone. It requires no Pinecone credentials, records a deterministic absence fingerprint, and performs no external deletion. |
| `package.json` `staging:decommission-pinecone` script | Controlled decommission entry point | Package metadata exposes the guarded control script only; no Pinecone provider dependency remains. |
| `lib/staging/cutover-contract.ts`, `scripts/staging/legacy-caller-inventory.ts`, and `scripts/staging/finalize-cutover.ts` | Inventory and safety contract terms | Read-only classification and fail-closed validation for the Plan 016 cutover. |

Before Plan 016 is marked `DONE`, rerun the inventory and remove all dependency or runtime matches that are not covered by this table. The final dossier must show zero runtime callers, zero legacy write callers, and preservation of the two 1024-dimensional Vectorize resources.
