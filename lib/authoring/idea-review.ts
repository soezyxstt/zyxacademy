import { createHash } from "node:crypto";
import { serializeDeterministically, type ValidatedIdeaBundle } from "@/lib/bundle/idea-bundle-v2";
import { sha256Text } from "@/lib/bundle/validator";

export type IdeaReviewItem = { ideaId: string; ideaHash: string; status: "approved" | "changes_requested"; notes?: string | null };

function evidenceId(prefix: string, value: unknown): string {
  return `${prefix}-${createHash("sha256").update(`${prefix}:${serializeDeterministically(value)}`).digest("hex").slice(0, 32)}`;
}

export function ideaReviewAuditId(importId: string, reviewerId: string, evidence: unknown): string {
  // Preserve the existing headless audit identity.
  const prefix = "audit-idea-revision-review";
  const value = `${importId}:${reviewerId}:${serializeDeterministically(evidence)}`;
  return `${prefix}-${createHash("sha256").update(`${prefix}:${value}`).digest("hex").slice(0, 32)}`;
}

export function ideaItemReviewAuditId(importId: string, reviewerId: string, revision: string, item: { ideaId: string; status: string; notes: string | null }): string {
  return evidenceId("audit-idea-item-review", { importId, reviewerId, revision, ...item });
}

export function ideaReviewTargets(bundle: ValidatedIdeaBundle) {
  return bundle.entities.ideas.map((idea) => ({
    ideaId: idea.id,
    ideaHash: sha256Text(serializeDeterministically(idea)),
  }));
}

/** Validates explicit decisions against every Idea in the reviewed artifact. */
export function normalizeIdeaReviewItems(targets: readonly { ideaId: string; ideaHash: string }[], items: readonly IdeaReviewItem[], decision: "approved" | "rejected") {
  const expected = new Map(targets.map((target) => [target.ideaId, target.ideaHash]));
  if (!expected.size || expected.size !== targets.length || items.length !== expected.size) throw new Error("IDEA_BUNDLE_ITEM_REVIEW_INCOMPLETE");
  const seen = new Set<string>();
  const normalized = items.map((item) => {
    if (seen.has(item.ideaId) || expected.get(item.ideaId) !== item.ideaHash) throw new Error("IDEA_BUNDLE_ITEM_REVIEW_MISMATCH");
    if (item.status !== "approved" && item.status !== "changes_requested") throw new Error("IDEA_BUNDLE_ITEM_REVIEW_INVALID");
    if (decision === "approved" && item.status !== "approved") throw new Error("IDEA_BUNDLE_ITEM_REVIEW_INCOMPLETE");
    const notes = item.notes?.trim() || null;
    if (notes && notes.length > 2000) throw new Error("IDEA_ITEM_REVIEW_NOTES_LIMIT");
    seen.add(item.ideaId);
    return { ideaId: item.ideaId, ideaHash: item.ideaHash, status: item.status, notes };
  });
  return normalized.sort((a, b) => a.ideaId.localeCompare(b.ideaId));
}
