import type { SolutionCollection } from "../../lib/materials/solution-collection";
import type { SolutionItemDecision } from "./solution-review-decisions";

export type Choice = "approved" | "changes_requested";
export type Criterion = "correctness" | "reasoning" | "problemProvenance" | "solutionProvenance" | "release";
export type ItemDraft = Partial<Record<Criterion, Choice>> & { notes?: string };
export type ReviewContext = { reviewerId?: string; savedReview?: { decision: string; items: SolutionItemDecision[] } | null; reviewVersion: string; revision: string; productId: string; itemHashes: { itemId: string; itemHash: string }[] };
export type DraftStore = { importId: string; baseReview?: string; items: Record<string, { itemHash: string; draft: ItemDraft }>; previousItems?: Record<string, { itemId: string; itemHash: string; draft: ItemDraft }> };
export const criteria: { key: Criterion }[] = ["correctness", "reasoning", "problemProvenance", "solutionProvenance", "release"].map(key => ({ key: key as Criterion }));

/** An unanswered decision never grants approval; hashes come from the server context. */
export function buildSolutionReview(context: ReviewContext, collection: SolutionCollection, draft: Record<string, ItemDraft>) {
  if (context.productId !== collection.id || context.itemHashes.length !== collection.items.length || collection.items.length === 0) return null;
  const hashes = new Map(context.itemHashes.map((entry) => [entry.itemId, entry.itemHash]));
  if (hashes.size !== collection.items.length) return null;
  const items: (SolutionItemDecision & { reasoning: Choice })[] = [];
  for (const item of collection.items) {
    const entry = draft[item.id];
    const itemHash = hashes.get(item.id);
    if (!entry || !itemHash || criteria.some(({ key }) => !entry[key])) return null;
    items.push({
      itemId: item.id, itemHash,
      correctness: entry.correctness!, reasoning: entry.reasoning!,
      problemProvenance: entry.problemProvenance!, solutionProvenance: entry.solutionProvenance!, release: entry.release!,
      notes: entry.notes?.trim() || undefined,
    });
  }
  return { expectedRevision: context.revision, expectedReviewVersion: context.reviewVersion, items, approved: items.every((item) => [item.correctness, item.reasoning, item.problemProvenance, item.solutionProvenance, item.release].every((value) => value === "approved")) };
}

/** Keep decisions only when the server confirms the same item content in the new revision. */
export function reconcileSolutionReviewDrafts(store: DraftStore, importId: string, context: ReviewContext): DraftStore {
  if (store.importId !== importId) return { importId, items: {} };
  const hashes = new Map(context.itemHashes.map(({ itemId, itemHash }) => [itemId, itemHash]));
  const previousItems = { ...store.previousItems };
  const items: DraftStore["items"] = {};
  for (const [id, entry] of Object.entries(store.items)) {
    if (hashes.get(id) === entry.itemHash) items[id] = entry;
    else previousItems[JSON.stringify([id, entry.itemHash])] = { itemId: id, ...entry };
  }
  return { importId, baseReview: store.baseReview, items, previousItems };
}

/** A browser draft records the server decision it was based on, independent of item hashes. */
export function solutionReviewBaseline(context: ReviewContext): string {
  const review = context.savedReview;
  return JSON.stringify({ reviewVersion: context.reviewVersion, review: review ? { decision: review.decision, items: [...review.items].sort((a, b) => a.itemId.localeCompare(b.itemId)).map(item => ({ itemId: item.itemId, itemHash: item.itemHash, ...Object.fromEntries(criteria.map(({ key }) => [key, item[key]])), notes: item.notes?.trim() ?? "" })) } : null });
}

export function localReviewDraft(value: unknown, importId: string, context: ReviewContext): DraftStore {
  const items: DraftStore["items"] = {};
  const previousItems: NonNullable<DraftStore["previousItems"]> = {};
  let baseReview: string | undefined;
  function readDraft(entry: unknown): { itemHash: string; draft: ItemDraft } | null {
    if (!entry || typeof entry !== "object" || !("itemHash" in entry) || typeof entry.itemHash !== "string" || !("draft" in entry) || !entry.draft || typeof entry.draft !== "object") return null;
    const draft: ItemDraft = {};
    const storedDraft = entry.draft as Record<string, unknown>;
    for (const { key } of criteria) if (["approved", "changes_requested"].includes(String(storedDraft[key]))) draft[key] = storedDraft[key] as Choice;
    if ("notes" in entry.draft && typeof entry.draft.notes === "string") draft.notes = entry.draft.notes.slice(0, 2000);
    return { itemHash: entry.itemHash, draft };
  }
  if (value && typeof value === "object" && "importId" in value && value.importId === importId && "items" in value && value.items && typeof value.items === "object") {
    if ("baseReview" in value && typeof value.baseReview === "string") baseReview = value.baseReview;
    for (const [id, entry] of Object.entries(value.items)) {
      const parsed = readDraft(entry);
      if (parsed) items[id] = parsed;
    }
    if ("previousItems" in value && value.previousItems && typeof value.previousItems === "object") {
      for (const entry of Object.values(value.previousItems)) {
        const parsed = readDraft(entry);
        if (parsed && entry && typeof entry === "object" && "itemId" in entry && typeof entry.itemId === "string") previousItems[JSON.stringify([entry.itemId, parsed.itemHash])] = { itemId: entry.itemId, ...parsed };
      }
    }
  }
  let baseline: { review?: { items?: (ItemDraft & { itemId: string; itemHash: string })[] } | null } | null = null;
  try { baseline = baseReview ? JSON.parse(baseReview) : null; } catch { /* Historical drafts have no trusted baseline. */ }
  const saved = new Map((Array.isArray(baseline?.review?.items) ? baseline.review.items : baseReview ? [] : context.savedReview?.items ?? []).map(item => [item.itemId, item]));
  for (const [id, entry] of Object.entries(items)) {
    const original = saved.get(id);
    if ((!original || original.itemHash === entry.itemHash) && !itemDraftDiffers(entry.draft, original ?? {})) delete items[id];
  }
  return reconcileSolutionReviewDrafts({ importId, items, baseReview, previousItems }, importId, context);
}

function itemDraftDiffers(local: ItemDraft, saved: ItemDraft) {
  return criteria.some(({ key }) => local[key] !== saved[key]) || (local.notes?.trim() ?? "") !== (saved.notes?.trim() ?? "");
}

export function solutionReviewPendingChanges(value: unknown, importId: string, context: ReviewContext): boolean {
  const local = localReviewDraft(value, importId, context);
  return Object.keys(local.items).length > 0 || Object.keys(local.previousItems ?? {}).length > 0;
}

export function solutionReviewDraftConflicts(value: unknown, importId: string, context: ReviewContext): boolean {
  const local = localReviewDraft(value, importId, context);
  return Object.keys(local.items).length > 0 && local.baseReview !== solutionReviewBaseline(context) && !(local.baseReview === undefined && !context.savedReview);
}

/** A newer server decision always wins until the reviewer explicitly recovers a conflicting draft. */
export function restoreSolutionReviewDrafts(value: unknown, importId: string, context: ReviewContext, recoverConflict = false): DraftStore {
  const items: DraftStore["items"] = {};
  const hashes = new Map(context.itemHashes.map(item => [item.itemId, item.itemHash]));
  for (const item of context.savedReview?.items ?? []) if (hashes.get(item.itemId) === item.itemHash) items[item.itemId] = { itemHash: item.itemHash, draft: { ...item } };
  const local = localReviewDraft(value, importId, context);
  if (recoverConflict || !solutionReviewDraftConflicts(value, importId, context)) Object.assign(items, local.items);
  return reconcileSolutionReviewDrafts({ importId, items, baseReview: solutionReviewBaseline(context), previousItems: local.previousItems }, importId, context);
}

/** Only semantic changes block publication; whitespace-only notes do not change a decision. */
export function solutionReviewHasUnsavedChanges(context: ReviewContext, collection: SolutionCollection, draft: Record<string, ItemDraft>) {
  const saved = restoreSolutionReviewDrafts(null, "saved", context);
  return collection.items.some(item => {
    const local = draft[item.id] ?? {};
    const server = saved.items[item.id]?.draft ?? {};
    return itemDraftDiffers(local, server);
  });
}


export type PublicationIssue = { code: string; severity?: string };

/** Only controlled explanations reach the UI; backend enums and raw errors stay private. */
export function solutionPublicationBlockers(issues: readonly PublicationIssue[] = []) {
  const reasons: Record<string, string> = { PRODUCT_V5_PROFILE_MISMATCH: "blockerFormat", PRODUCT_DEPENDENCY_NEEDS_REVIEW: "blockerReferences", PRODUCT_V5_LIVE_DEPENDENCY_MISMATCH: "blockerChanged", PRODUCT_V5_REVIEW_REQUIRED: "blockerReview" };
  const blocking = issues.filter(issue => issue.severity !== "warning");
  return [...new Set(blocking.length ? blocking.map(issue => reasons[issue.code] ?? "blockerUnknown") : ["blockerPending"])];
}
