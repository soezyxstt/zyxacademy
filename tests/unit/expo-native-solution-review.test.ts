import { expect, test } from "bun:test";
import { solutionCollectionFixture as collection } from "@/app/visual-fixtures/solution-collection/fixture";
import {
  readSolutionReview, saveSolutionReview, solutionReviewCanPublish, solutionReviewWebPath, type SolutionReviewAttempt,
} from "@/apps/mobile-native/features/academic/administration/solution-review-client";
import { buildSolutionReview, restoreSolutionReviewDrafts, solutionReviewBaseline, solutionReviewDraftConflicts } from "@/packages/academic/solution-review-state";
import { readProductReview } from "@/apps/mobile-native/features/academic/administration/product-review-client";

const revision = "a".repeat(64);
const reviewerId = "admin";
const productId = collection.id;
const itemHashes = collection.items.map(({ id }, index) => ({ itemId: id, itemHash: String(index + 1).repeat(64) }));
const positive = { correctness: "approved", reasoning: "approved", problemProvenance: "approved", solutionProvenance: "approved", release: "approved" } as const;
const context = { reviewerId, revision, reviewVersion: "b".repeat(64), productId, collection, itemHashes, savedReview: null };
const saved = { ...context, savedReview: { decision: "approved", items: itemHashes.map(item => ({ ...item, ...positive })) } };
const origin = "https://example.test";
const signal = new AbortController().signal;
const transport = (result: unknown) => ({ origin, accountId: reviewerId, locale: "id", get: async (path: string) => {
  expect(path).toBe(`/api/admin/bundles/product/bundle%20id/solution-review?expectedRevision=${revision}`);
  return Response.json({ result });
} });

test("visual browser handoff accepts only known course and bundle route identifiers", () => {
  expect(solutionReviewWebPath("course-1", "bundle-1")).toBe("/admin/courses/course-1/review/product/bundle-1");
  expect(solutionReviewWebPath("..", "bundle-1")).toBeNull();
  expect(solutionReviewWebPath("course-1", "https://outside.example/?token=fixture")).toBeNull();
});

test("product workspace recognizes the canonical V5 payload without fetching a V4 rubric", async () => {
  const scope = { id: "bundle id", courseId: collection.course.id, checksum: revision };
  const detail = {
    bundle: { id: scope.id, courseId: scope.courseId, checksum: revision, bundleId: "v5-example", status: "draft", currentReview: null },
    manifest: { schemaVersion: "product-bundle.v5" }, draft: { products: [{ id: collection.id, productType: "solution_collection", collection }] },
    previews: [], blockReviews: [], qualityEvaluation: { publicationReady: false }, publicationBlocked: false,
    pedagogicReview: null, v4ReviewContext: null,
  };
  const read = (body: unknown) => readProductReview({ ...transport(null), get: async path => {
    expect(path).toBe("/api/admin/bundles/product/bundle%20id");
    return Response.json(body);
  } }, scope, signal);
  expect((await read(detail)).solutionCollection?.items.map(item => item.id)).toEqual(collection.items.map(item => item.id));
  await expect(read({ ...detail, draft: { products: [] } })).rejects.toMatchObject({ status: 422 });
});

test("V5 native reads the exact collection and Admin reviewer before binding per-item hashes", async () => {
  const read = (result: unknown) => readSolutionReview(transport(result), "bundle id", revision, collection, signal);
  expect((await read(saved)).savedReview?.items.map(entry => entry.itemHash)).toEqual(itemHashes.map(entry => entry.itemHash));
  for (const result of [
    { ...saved, reviewerId: "another" },
    { ...saved, revision: "c".repeat(64) },
    { ...saved, itemHashes: [itemHashes[0], itemHashes[0]] },
    { ...saved, savedReview: { ...saved.savedReview, items: saved.savedReview.items.map(item => ({ ...item, itemHash: "e".repeat(64) })) } },
  ]) await expect(read(result)).rejects.toMatchObject({ status: 409 });
});

test("V5 publish uses complete current saved approval and remains blocked by local or uncertain edits", () => {
  const ready = { dirty: false, busy: false, pending: false, conflict: false };
  const values = Object.fromEntries(collection.items.map(item => [item.id, positive]));
  const result = buildSolutionReview(saved, collection, values);
  expect(result?.items.map(item => item.itemHash)).toEqual(itemHashes.map(item => item.itemHash));
  expect(solutionReviewCanPublish(saved, result, ready)).toBe(true);
  expect(solutionReviewCanPublish(context, result, ready)).toBe(false);
  expect(solutionReviewCanPublish(saved, null, ready)).toBe(false);
  for (const key of ["dirty", "busy", "pending", "conflict"] as const) {
    expect(solutionReviewCanPublish(saved, result, { ...ready, [key]: true })).toBe(false);
  }
});

test("new V5 revisions recover notes but do not apply old item decisions to changed content", () => {
  const revised = { ...context, revision: "f".repeat(64), reviewVersion: "d".repeat(64),
    itemHashes: [itemHashes[0], { ...itemHashes[1], itemHash: "9".repeat(64) }] };
  const draft = {
    importId: "bundle id", baseReview: solutionReviewBaseline(context), items: {
      [itemHashes[0].itemId]: { itemHash: itemHashes[0].itemHash, draft: { ...positive } },
      [itemHashes[1].itemId]: { itemHash: itemHashes[1].itemHash, draft: { ...positive, notes: "Keep for manual recovery" } },
    },
  };
  expect(solutionReviewDraftConflicts(draft, "bundle id", revised)).toBe(true);
  const recovered = restoreSolutionReviewDrafts(draft, "bundle id", revised, true);
  expect(recovered.items[itemHashes[1].itemId]).toBeUndefined();
  expect(Object.values(recovered.previousItems ?? {})[0].draft.notes).toBe("Keep for manual recovery");
  expect(buildSolutionReview(revised, collection, Object.fromEntries(Object.entries(recovered.items).map(([id, entry]) => [id, entry.draft])))).toBeNull();
});

test("V5 review retries reuse an immutable version, decision and item body and require an exact receipt", async () => {
  const attempt: SolutionReviewAttempt = {
    requestId: "stable-attempt", payload: { expectedRevision: revision, expectedReviewVersion: context.reviewVersion,
      decision: "approved", items: itemHashes.map(item => ({ ...item, ...positive })) },
  };
  const response = (digest: string) => ({ ...transport(saved), command: async (path: string, init: unknown) => {
    expect(path).toBe("/api/admin/bundles/product/bundle%20id/solution-review");
    expect(init).toEqual({ method: "POST", requestId: attempt.requestId, body: attempt.payload });
    return Response.json({ result: { revision: digest, reviewVersion: "8".repeat(64), decision: "approved", reviewId: "receipt", created: true } });
  } });
  expect(await saveSolutionReview(response("0".repeat(64)), "bundle id", attempt, signal)).toEqual({ status: "uncertain" });
  expect(await saveSolutionReview(response(revision), "bundle id", attempt, signal)).toEqual({ status: "saved", reviewVersion: "8".repeat(64) });
  expect(await saveSolutionReview({ ...transport(saved), command: async () => new Response(null, { status: 409 }) }, "bundle id", attempt, signal))
    .toEqual({ status: "stale" });
});
