import { describe, expect, test } from "bun:test";
import { solutionCollectionFixture } from "@/app/visual-fixtures/solution-collection/fixture";
import { buildSolutionReview, reconcileSolutionReviewDrafts, restoreSolutionReviewDrafts, solutionReviewHasUnsavedChanges, solutionPublicationBlockers, solutionReviewBaseline, solutionReviewDraftConflicts, solutionReviewPendingChanges } from "@/components/admin/solution-collection-review";

const context = {
  reviewVersion: "a".repeat(64),
  revision: "revision-1", productId: "collection-demo",
  itemHashes: [{ itemId: "triangle-area", itemHash: "triangle-hash" }, { itemId: "python-loop", itemHash: "python-hash" }],
};
const approved = { correctness: "approved", reasoning: "approved", problemProvenance: "approved", solutionProvenance: "approved", release: "approved" } as const;

describe("solution review drafts", () => {
  test("requires every decision and binds the saved review to the supplied revision and item hashes", () => {
    expect(buildSolutionReview(context, solutionCollectionFixture, { "triangle-area": approved })).toBeNull();
    const review = buildSolutionReview(context, solutionCollectionFixture, { "triangle-area": { ...approved, notes: "  Checked units  " }, "python-loop": approved });
    expect(review?.expectedRevision).toBe("revision-1");
    expect(review?.expectedReviewVersion).toBe(context.reviewVersion);
    expect(review?.items.map((item) => item.itemHash)).toEqual(["triangle-hash", "python-hash"]);
    expect(review?.items[0].notes).toBe("Checked units");
    expect(review?.approved).toBe(true);
    expect(buildSolutionReview({ ...context, productId: "other" }, solutionCollectionFixture, { "triangle-area": approved, "python-loop": approved })).toBeNull();
    expect(buildSolutionReview({ ...context, itemHashes: [context.itemHashes[0], context.itemHashes[0]] }, solutionCollectionFixture, { "triangle-area": approved, "python-loop": approved })).toBeNull();
    expect(buildSolutionReview(context, solutionCollectionFixture, { "triangle-area": approved, "python-loop": { ...approved, release: "changes_requested" } })?.approved).toBe(false);
  });

  test("retains unchanged item decisions, archives changed or removed drafts, and isolates imports", () => {
    const store = { importId: "import-1", items: {
      "triangle-area": { itemHash: "triangle-hash", draft: { ...approved, notes: "keep" } },
      "python-loop": { itemHash: "python-hash", draft: { ...approved, notes: "discard" } },
      removed: { itemHash: "old", draft: approved },
    } };
    const revised = { ...context, revision: "revision-2", itemHashes: [context.itemHashes[0], { itemId: "python-loop", itemHash: "new-python-hash" }] };
    const kept = reconcileSolutionReviewDrafts(store, "import-1", revised);
    expect(Object.keys(kept.items)).toEqual(["triangle-area"]);
    expect(kept.items["triangle-area"].draft.notes).toBe("keep");
    expect(Object.values(kept.previousItems ?? {}).map(entry => entry.draft.notes)).toContain("discard");
    expect(Object.values(kept.previousItems ?? {}).map(entry => entry.itemId)).toContain("removed");
    expect(reconcileSolutionReviewDrafts(store, "import-2", revised).items).toEqual({});
  });
});

test("changed item notes remain recoverable through repeated context reads and serialization", () => {
  const original = { importId: "import-1", baseReview: solutionReviewBaseline(context), items: {
    "triangle-area": { itemHash: "triangle-hash", draft: { correctness: "approved" as const, notes: "Keep my rationale for copying" } },
  } };
  const revised = { ...context, revision: "revision-2", itemHashes: [{ itemId: "triangle-area", itemHash: "new-triangle" }, context.itemHashes[1]] };
  const recovered = restoreSolutionReviewDrafts(original, "import-1", revised);
  expect(recovered.items["triangle-area"]).toBeUndefined();
  expect(Object.values(recovered.previousItems ?? {})[0]).toMatchObject({ itemId: "triangle-area", itemHash: "triangle-hash", draft: { notes: "Keep my rationale for copying" } });
  const reread = restoreSolutionReviewDrafts(JSON.parse(JSON.stringify(recovered)), "import-1", revised);
  expect(reread.previousItems).toEqual(recovered.previousItems);
  expect(solutionReviewPendingChanges(reread, "import-1", revised)).toBe(true);
  expect(solutionReviewPendingChanges({ ...reread, previousItems: {} }, "import-1", revised)).toBe(false);
  expect(buildSolutionReview(revised, solutionCollectionFixture, Object.fromEntries(Object.entries(reread.items).map(([id, entry]) => [id, entry.draft])))).toBeNull();
});

test("pending changes compare semantic values with the original saved baseline", () => {
  const saved = { ...context, savedReview: { decision: "approved", items: context.itemHashes.map(item => ({ ...item, ...approved })) } };
  const store = restoreSolutionReviewDrafts(null, "import-1", saved);
  expect(solutionReviewPendingChanges(store, "import-1", saved)).toBe(false);
  const edited = { ...store, items: { ...store.items, "triangle-area": { itemHash: "triangle-hash", draft: { ...approved, notes: "A temporary note" } } } };
  expect(solutionReviewPendingChanges(edited, "import-1", saved)).toBe(true);
  for (const notes of ["", "  \n "]) {
    const reverted = { ...edited, items: { ...edited.items, "triangle-area": { itemHash: "triangle-hash", draft: { ...approved, notes } } } };
    expect(solutionReviewPendingChanges(reverted, "import-1", saved)).toBe(false);
    const changed = { ...saved, itemHashes: [{ itemId: "triangle-area", itemHash: "changed" }, context.itemHashes[1]] };
    expect(Object.values(restoreSolutionReviewDrafts(reverted, "import-1", changed).previousItems ?? {})).toHaveLength(0);
  }
  expect(solutionReviewPendingChanges({ importId: "import-1", items: { "triangle-area": { itemHash: "triangle-hash", draft: { notes: "  " } } } }, "import-1", context)).toBe(false);
});

 test("restores saved server decisions and recoverable partial drafts only for confirmed item hashes", () => {
  const saved = { ...context, savedReview: { decision: "approved", items: [{ itemId: "triangle-area", itemHash: "triangle-hash", ...approved, notes: "Verified" }] } };
  const restored = restoreSolutionReviewDrafts({ importId: "import-1", baseReview: solutionReviewBaseline(saved), items: {
    "python-loop": { itemHash: "python-hash", draft: { correctness: "approved", release: "forged", notes: "partial" } },
    changed: { itemHash: "stale", draft: approved },
  } }, "import-1", saved);
  expect(restored.items["triangle-area"].draft).toMatchObject({ reasoning: "approved", notes: "Verified" });
  expect(restored.items["python-loop"].draft).toEqual({ correctness: "approved", notes: "partial" });
  expect(restored.items.changed).toBeUndefined();
  expect(Object.keys(restoreSolutionReviewDrafts({ importId: "other", items: restored.items }, "import-1", saved).items)).toEqual(["triangle-area"]);
 });

test("saved reasoning stays independent and unsaved changes cannot masquerade as saved approval", () => {
  const saved = { ...context, savedReview: { decision: "approved", items: context.itemHashes.map(item => ({ ...item, ...approved })) } };
  const restored = restoreSolutionReviewDrafts(null, "import-1", saved);
  const drafts = Object.fromEntries(Object.entries(restored.items).map(([id, entry]) => [id, entry.draft]));
  expect(solutionReviewHasUnsavedChanges(saved, solutionCollectionFixture, drafts)).toBe(false);
  const changed = { ...drafts, "triangle-area": { ...drafts["triangle-area"], reasoning: "changes_requested" as const } };
  expect(solutionReviewHasUnsavedChanges(saved, solutionCollectionFixture, changed)).toBe(true);
  const mixed = { ...saved, savedReview: { decision: "rejected", items: saved.savedReview.items.map((item, index) => ({ ...item, reasoning: index === 0 ? "changes_requested" as const : "approved" as const })) } };
  const recovered = restoreSolutionReviewDrafts(null, "import-1", mixed);
  expect(recovered.items["triangle-area"].draft).toMatchObject({ correctness: "approved", reasoning: "changes_requested" });
});


test("publication blockers explain stale references without exposing backend codes", () => {
  const stale = solutionPublicationBlockers([{ code: "PRODUCT_V5_LIVE_DEPENDENCY_MISMATCH", severity: "blocking" }]);
  expect(stale).toEqual(["blockerChanged"]);
  expect(solutionPublicationBlockers([{ code: "SECRET_INTERNAL_ENUM" }]).join(" ")).not.toContain("SECRET_INTERNAL_ENUM");
  expect(solutionPublicationBlockers([{ code: "PRODUCT_V5_REVIEW_REQUIRED" }])).toEqual(["blockerReview"]);
});


test("a draft based on an older server review never silently replaces the current decision", () => {
  const previous = { ...context, savedReview: { decision: "approved", items: context.itemHashes.map(item => ({ ...item, ...approved })) } };
  const local = { importId: "import-1", baseReview: solutionReviewBaseline(previous), items: { "triangle-area": { itemHash: "triangle-hash", draft: { ...approved, notes: "Local rationale" } } } };
  expect(solutionReviewDraftConflicts(local, "import-1", previous)).toBe(false);
  const current = { ...previous, savedReview: { decision: "rejected", items: previous.savedReview.items.map(item => ({ ...item, reasoning: "changes_requested" as const })) } };
  expect(solutionReviewDraftConflicts(local, "import-1", current)).toBe(true);
  expect(restoreSolutionReviewDrafts(local, "import-1", current).items["triangle-area"].draft.reasoning).toBe("changes_requested");
  const recovered = restoreSolutionReviewDrafts(local, "import-1", current, true);
  expect(recovered.items["triangle-area"].draft.reasoning).toBe("approved");
  expect(recovered.baseReview).toBe(solutionReviewBaseline(current));
  expect(solutionReviewHasUnsavedChanges(current, solutionCollectionFixture, Object.fromEntries(Object.entries(recovered.items).map(([id, entry]) => [id, entry.draft])))).toBe(true);
  expect(solutionReviewDraftConflicts({ ...local, baseReview: undefined }, "import-1", current)).toBe(true);
});
