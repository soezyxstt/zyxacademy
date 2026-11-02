export interface CodingDraftSnapshot { code: string; stdin: string; revision?: number }

/** A local draft may be rebased only against the revision it was edited from. */
export function reconcileCodingDraft(local: CodingDraftSnapshot | null, remote: CodingDraftSnapshot | null) {
  if (!remote) return { source: "local" as const, conflict: false, revision: 0 };
  if (!local) return { source: "remote" as const, conflict: false, revision: remote.revision ?? 0 };
  const same = local.code === remote.code && local.stdin === remote.stdin;
  return { source: "local" as const, conflict: !same && local.revision !== remote.revision, revision: remote.revision ?? 0 };
}
