# Authoring transfer V1

Status: `ACTIVE`

Implemented locally on the transfer branch. Deployment, remote R2/Turso/Inngest acceptance, OAuth host reauthorization, and production transfers are separate gates. The [complete roadmap](../../plans/bundle-environment-transfer.md) remains open.

## Supported boundary

`authoring-transfer.v1` copies exact Idea V3 and learning Product V3/V4 ZIP bytes between configured peers. The destination owns the job and produces unpublished drafts or reuses exact existing imports. Product V4 must satisfy its existing single-Article contract. Transfer never publishes dependencies or carries approval/PDF verification evidence into active destination reviews.

Current support is `exact_identity`. Course, chapter, creator/curator, bundle, and entity identities must already be compatible. Missing identities and conflicting content block transfer. There is no mapping/fork converter. Source figures and Markdown images fail with `ASSET_BINDING_UNSUPPORTED`; original PDF/Source Pack migration and figure re-extraction remain pending. Supported sources are embedded in Idea ZIPs. V2 and assessment Product transfers are rejected.

Uploader-bound creator/curator sentinels can retain their meaning only when the destination actor matches the source uploader identity. A different actor requires an attribution converter and currently blocks. A creator bound to an approving-reviewer sentinel also blocks. Destination review decisions are always new local decisions.

## Peer security

`AUTHORING_TRANSFER_IDENTITY` is compact JSON with `id`, exact HTTPS `origin`, `keyId`, private Ed25519 `signingKey` JWK, and private P-256 `encryptionKey` JWK. `AUTHORING_TRANSFER_PEERS` is a compact JSON array containing the same public identity fields plus `allowSource`, `allowDestination`, `databaseFingerprint`, and `storageFingerprint`. Private JWK fields are forbidden in peer entries. Optional `previousKeys` permits at most two retained keys, each with a unique `keyId` and an absolute millisecond `acceptUntil`. Identity entries retain private signing/encryption keys; peer entries retain only public signing keys. New signatures and encryption always use the active key. Retained keys are accepted only before their deadline. Relative to the local server, `allowSource` permits pulling from a peer; `allowDestination` permits granting that peer selected local artifacts. Database/bucket collisions are rejected. Agent input cannot supply arbitrary peer URLs.

No `FEATURE_*` flag is added. The operator selected always-on with peer/direction policies. Missing configuration leaves transfer unavailable. Disabling a direction blocks new operations and subsequent worker checkpoints.

Both sides require an active canonical admin and live session. A source grant binds one root revision and bounded same-course closure to a destination. JWT signatures use EdDSA; opaque handoffs use standard JWE `ECDH-ES` / `A256GCM`. Peer proofs bind operation and request body. Source session/OAuth tokens and database/R2 credentials are never relayed. Treat the encrypted `sourceGrant` as sensitive: never echo it, place it in a URL, or log it.

Claim window and plan lifetime are 15 minutes. Claimed job/grant authorization lasts at most 24 hours. Session expiry, logout, role removal, and grant revocation stop subsequent checks. A grant is claimed by one destination transfer ID; that job can retry. Claim is a short metadata operation. The destination job requests individual artifacts, which are pinned on demand into immutable source-owned snapshot keys before streaming. If exact bytes disappear before their pin, transfer blocks. All artifacts must be copied and verified before any destination content materialization.

The three scopes are opt-in: `authoring:transfer:source`, `authoring:transfer:read`, `authoring:transfer:execute`. Legacy default scopes remain the original four. OAuth consent advertises seven scopes; old tokens are never widened. Connection-token creation also defaults to four scopes and accepts an explicit JSON `scopes` array for additional supported scopes. Direct admin sessions retain canonical authorization checks.

## API and MCP

Authenticated responses and artifact responses are `no-store`. Admin operations are actor-owned. All routes use Node handlers; compute jobs remain framework-neutral.

| Path | Method | Input or result |
| --- | --- | --- |
| `/api/authoring/transfers/capabilities` | GET | Public minimum protocol, schemas, mode, and mapping/asset limitations. |
| `/api/admin/transfers/source-grants` | POST | `{targetPeerId,selector:{kind,importId,expectedChecksum}}`, returns grant ID and encrypted handoff. |
| `/api/admin/transfers/source-grants/:id` | DELETE | Revoke actor-owned grant; no body. |
| `/api/admin/transfers/plan` | POST | `{sourcePeerId,sourceGrant}`, returns actions, blockers, hash, expiry, and executable plan token when compatible. |
| `/api/admin/transfers` | POST | `{planToken,idempotencyKey}`, returns `202` with transfer ID. |
| `/api/admin/transfers/:id` | GET | State, item checkpoints, reason code, and receipt. |
| `/api/admin/transfers/:id/resume` | POST | `{}` or `{sourceGrant}` to renew authorization for an identical closure. |
| `/api/admin/transfers/:id/cancel` | POST | Cancel future commits; no body. |
| `/api/internal/transfers/inspect` | POST | Signed inventory under a source grant and peer proof. |
| `/api/internal/transfers/snapshots` | POST | Claim and prepare the exact source snapshot. |
| `/api/internal/transfers/artifact` | POST | Exact bounded bytes under the claimed grant/transfer/artifact IDs. |

Internal bodies include a source-signed `grantToken`, plus `transferId` after claim and `artifactId` for artifact reads. Separate short-lived peer proof and `x-transfer-peer` identify the caller. Artifacts currently retry from the beginning individually; HTTP Range is not advertised.

MCP tools: `transfer.capabilities`, `transfer.create_source_grant`, `transfer.revoke_source_grant`, `transfer.plan`, `transfer.execute`, `transfer.status`, `transfer.resume`, `transfer.cancel`. `workflow.list` exposes discovery guidance. The scope-protected MCP resource `zyx://authoring/transfer/v1` serves the current step-by-step procedure, recovery actions, and capability limits from the same deployment. Source grant creation uses the independently authorized source connection; plan/execute/status use the destination connection. External plugin distribution and host catalog refresh remain separate acceptance steps.

## Integrity, lifecycle, and recovery

The resolver locates exact upstream producers, validates recorded ZIP checksums, and traverses a stable topological closure including Idea/source requirements, source excerpts, learning sections, and external Product dependencies. Source inventory cannot select latest to replace an unavailable historical revision. Limits: 100 artifacts, 500 entities, 32 MiB per artifact, 512 MiB total, and 128000 characters per executable plan token. Larger operations fail before execute.

Plan tokens bind actor/session, closure, destination import preconditions, target schema/policy fingerprint, and expiry. Plans do not write content or create jobs. Changed target/contract preconditions invalidate execution. The same idempotency key with a different token produces `TRANSFER_IDEMPOTENCY_CONFLICT`.

Destination byte hashes and bundle validators run independently. Product materialization reuses publication's exact Idea/source/excerpt/dependency checks and current quality policy. Idea drafts are materialized first. Until required Ideas, sections, and upstream Products are published through normal destination workflows, dependent Product bytes stay in private transfer intake with `waiting_prerequisites`. Resume does not bypass those publication decisions.

Transfer states: `queued`, `running`, `retry_wait`, `waiting_prerequisites`, `blocked`, `completed`, `cancelled`, `failed`. Items: `pending`, `copied`, `materialized`. `transportComplete` concerns copied bytes; `draftMaterialized` requires completed reconciliation. Reusing an existing published import preserves that state. Receipt items carry local import IDs and ownership, with `mode=draft_only`.

Workers use renewable 10 minute leases and state-version fencing inside destination staging transactions. The once-per-minute compute maintenance job recovers the durable outbox and stalled jobs. Duplicate delivery cannot overwrite conflicting drafts. Transient failures retry up to five times with exponential backoff, jitter, and `Retry-After`. Cancellation leaves previously committed content intact. Import creation and its ownership checkpoint commit in the same database transaction, so a crash cannot leave a new draft without its transfer checkpoint.

Paused jobs can receive a new source grant for the identical closure under a live session of the same actor. Changed content needs a fresh plan. Source snapshots expire after 24 hours and are cleaned after a five minute grace period for in-flight reads. Destination quarantine is removed after authorization expiry plus seven days. Resume after that retention boundary returns `TRANSFER_REPLAN_REQUIRED`; a new plan can reuse exact destination imports. Transfer/grant metadata and receipts are pruned after expiry plus 90 days, after successful owned-blob cleanup. Idempotency keys and status lookup are retained for that window. General mutation audit rows follow the existing audit policy. Cleanup never deletes normal/reused bundle artifacts and derives deletion keys from validated inventory rather than stored arbitrary paths.
