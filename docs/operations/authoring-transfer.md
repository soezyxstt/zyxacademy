# Authoring transfer operations

Status: `ACTIVE`

Local implementation procedure. No staging/production setup or transfer is established by this document. See [the contract](../bundle/authoring-transfer-v1.md) and [open roadmap](../../plans/bundle-environment-transfer.md).

## Prepare

1. Inspect exact source/target origins, separate Turso databases, separate R2 buckets, active admins, compatible contracts, and the selected bundle revision read-only. Remote migrations, deployment, secrets, and real transfers require their own authorization and preflight.
2. Apply generated additive migrations `0098` and `0099` locally first. Validate web/compute boundaries and deploy both peer APIs before enabling a direction.
3. After verifying the environment selectors, generate private keys locally. This command reads configured resource identifiers to derive public fingerprints but makes no database/R2 requests:

   ```bash
   bun --env-file=.env.staging scripts/authoring/create-transfer-identity.ts \
     --id staging --origin https://staging.zyxacademy.com --output .env.transfer-staging
   ```

   The ignored output file is created exclusively with mode `0600`. It contains private `AUTHORING_TRANSFER_IDENTITY`; do not print or paste it into chat/logs. Console output contains only its path and a public peer entry with both directions initially false. Do not overwrite an existing identity to rotate keys.
4. Exchange reviewed public peer entries. Enable only the required `allowSource`/`allowDestination` directions. Store compact, single-line identity and registry JSON in the correct server environment. Web and compute share keys within one environment; different environments use different keys. Never substitute production keys when staging configuration is missing.
5. The Deno deployment workflow forwards optional `AUTHORING_TRANSFER_IDENTITY` and `AUTHORING_TRANSFER_PEERS` from the exact GitHub environment. Configure corresponding Vercel server values separately. There is no feature flag.
6. Verify actual Inngest registration of transfer worker, maintenance, and cleanup jobs. Rehearse synthetic non-production transfers and actual R2 byte readback/Turso transactions. Local fixtures do not establish these boundaries.
7. Reauthorize each MCP connection for the scopes needed. Source needs `authoring:transfer:source`; destination needs transfer read/execute. Existing tokens/default token creation retain four legacy scopes. For explicit session connection-token creation, the authenticated connection endpoint accepts `{"scopes":["authoring:transfer:read","authoring:transfer:execute"]}`.

## Execute

On the source connection, create a grant for the selected import/checksum and destination peer. Pass the encrypted handoff only as a destination `transfer.plan` argument. Read the deployment-owned MCP resource `zyx://authoring/transfer/v1`. Inspect environment identities, actions, and blockers. Execute the reviewed plan with a stable idempotency key, then poll status. Dispatch normally occurs in the next maintenance interval, up to roughly one minute plus queue delay.

When waiting for prerequisites, review/publish required Idea content through existing destination workflows only if separately authorized. Resume the transfer, then review the resulting Product draft and regenerate destination PDF/verification evidence before publication. The transfer tools never publish content.

For a real operation, record explicit authorization, exact environments/revisions, read-only before/after inventories, transfer ID, receipt, and remaining publication state. A successful build or deployment is not evidence of a successful transfer.

## Recovery

| Condition | Action |
| --- | --- |
| Lost agent/browser response | Retry the same plan/idempotency key; inspect the returned transfer ID. |
| Queue/outbox stalled | Inspect correct environment registration and delivery; reconcile before replay. Duplicate events are safe. |
| Network retry | Respect `retry_wait`; a failed artifact restarts independently with full checksum verification. |
| Worker crash/lease loss | Allow expiry and the recovery sweep; stale workers cannot commit through the fence. |
| Stale source/target/contract | Inspect the revision change; request a new grant and plan instead of selecting latest. |
| Missing published dependency | Complete authorized destination review/publication, then resume. |
| Expiry, revocation, logout, role change | Reauthorize and create a source grant for the same closure. Pass it to resume. Changed content requires a fresh plan. |
| Identity conflict/missing identity | Use existing identity provisioning or postpone; automatic remapping is unsupported. |
| Source figure/image | Do not strip assets/provenance to force transfer. Complete the planned adapter first. |
| Checksum mismatch | Stop and inspect storage/inventory; keep diagnostics to IDs/hashes. |
| Cancellation | Inspect committed item IDs; cancellation does not delete content. |
| Disable direction | Change the reviewed peer policy and revoke relevant source grants. Status remains readable. |
| Rotate keys | Use the overlap procedure below; removing a retained key immediately blocks tokens encrypted/signed with it. |
| Cleanup error | Inspect hourly cleanup of owned expired snapshots/quarantine and 90 day metadata pruning. Never delete normal bundle prefixes. |
| Recovery retention elapsed | `TRANSFER_REPLAN_REQUIRED` needs a fresh grant/plan. The old job cannot resume after expiry plus seven days. Exact imports remain reusable. |

Rollback retains additive schema and audit. Existing draft deletion or withdrawal requires ownership/dependency checks and appropriate authorization. Reused objects, edited drafts, published content, and source data are never automatically removed.

## Key rotation

1. Generate a new identity into a different ignored `.env.*` file. Keep environment ID, origin, database and bucket unchanged. Do not print either private identity.
2. Before switching active keys, add the new public signing key to each remote peer's `previousKeys`, with an explicit future `acceptUntil` in epoch milliseconds. This permits verification of the upcoming key during the rollout. Keep the existing active encryption key until the local server can decrypt the new one.
3. Configure the local identity with the new active signing/encryption keys and retain the old pair in `previousKeys`, using the old `keyId` and a reviewed deadline. Update web and compute together. The deadline must cover the maximum remaining 24 hour grant/job lifetime plus rollout grace. At most two retained keys are allowed.
4. Switch each remote peer entry to the new active public signing/encryption keys and retain the old public signing key until its deadline. The local identity can now decrypt handoffs addressed to either key. Deploying only the public encryption key before the recipient private key can decrypt it will interrupt new plans.
5. Test both old in-flight and new synthetic grants on the authorized non-production peers. After the deadline, remove the retained private/public keys. Never extend a compromised key's grace period; revoke it and renew affected grants instead.

Cleanup retries failed object deletion before marking its blobs cleaned. Status/receipts and idempotency keys expire with the 90 day metadata retention window. General mutation audit rows are preserved under their existing policy. Export an authorized operational receipt before that deadline when longer retention is required.

## Evidence boundaries

Local HTTP tests use two isolated processes, separate SQLite databases, synthetic keys, and in-memory storage. They exercise actual HTTP and signature/checksum validation but do not establish TLS infrastructure, actual R2/Turso, OAuth host acceptance, or Inngest delivery.

Consent visual fixture `/visual-fixtures/mcp-transfer-consent` uses the actual MCP layout and synthetic user data. Check default four scopes, explicit transfer selection/keyboard focus, and empty/disabled state at 380x844 and 1536x864. Artifacts remain ignored under `artifacts/visual-quality/`.
