/** Served by the same deployment as the protocol so agents can discover current transfer rules. */
export const TRANSFER_PLAYBOOK_URI = "zyx://authoring/transfer/v1";
export const transferPlaybook = {
  protocol: "authoring-transfer.v1",
  mode: "draft_only",
  steps: [
    "Use two independently authorized MCP connections. Verify transfer.capabilities on each environment and the configured peer directions.",
    "Select an exact source import ID and checksum. Never infer a revision from a title or select latest to replace a missing dependency.",
    "Create transfer.create_source_grant on the source connection with the reviewed target peer and selector. Treat sourceGrant as sensitive; pass it only as a tool argument, never echo or log it.",
    "Call transfer.plan on the destination connection. Inspect sourceEnvironment, targetEnvironment, rootId, checksums, reuse/copy actions, expiry, and blockers against the requested operation.",
    "Execute only a compatible plan within the user's authorization. Persist one idempotencyKey for the operation and retry transfer.execute with the same plan/key after a lost response.",
    "Poll transfer.status at retryAfterSeconds. Report copied bytes separately from materialized drafts. A receipt is complete only when state is completed and draftMaterialized is true.",
    "At waiting_prerequisites, identify the destination Idea/imports through status. Review/publish them only under separate publication authorization. Then call transfer.resume and poll again.",
    "Present the final transfer ID, environment identities, local import IDs, ownership/reuse, and draft state. Do not claim publication or carry source approval/PDF evidence into a destination review.",
  ],
  recovery: {
    PLAN_STALE: "Inspect changed source/target state and create a fresh grant/plan. Never edit the signed plan.",
    DEPENDENCY_NOT_PUBLISHED: "Finish authorized destination prerequisite review/publication, then resume.",
    GRANT_REVOKED: "Reauthorize both connections and create a new source grant for exactly the same closure before resume.",
    TRANSFER_REPLAN_REQUIRED: "Recovery retention has elapsed. Start a fresh plan; exact destination imports can be reused.",
    PEER_TEMPORARILY_UNAVAILABLE: "Wait for retry_wait backoff. Resume a failed job only after checking the peer.",
    IDENTITY_CONFLICT: "Inspect conflicting identities. Do not overwrite, fork, or change IDs automatically.",
    ASSET_BINDING_UNSUPPORTED: "Stop. Do not remove images or source provenance to force a compatible transfer.",
    CHECKSUM_MISMATCH: "Stop and inspect storage/inventory integrity. Do not bypass the validator.",
  },
  limitations: ["Exact identities only; no automatic course/chapter/creator mapping.", "Source figures and Markdown images require an adapter and are currently rejected.", "A grant can be claimed by one destination job.", "Cancellation stops later commits and preserves existing destination content."],
} as const;
