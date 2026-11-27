import { expect, test } from "bun:test";
import { ideaBundleControls, ideaEditCommand, ideaLifecycleCommand, isIdeaCommandReceipt, patchIdeaDraft,
  readIdeaBundle, validateIdeaBundleSnapshot } from "../../apps/mobile-native/features/academic/administration/idea-bundle-client";
import type { AcademicTransport } from "../../apps/mobile-native/features/academic/client";
import { isLiveAdministrationRead } from "../../packages/native-parity/academic/administration/live";

const scope = { id: "import/1", courseId: "course", checksum: "a".repeat(64) };
const idea = { id: "a", code: "BESARAN", chapterId: "chapter", canonicalStatement: "Jarak",
  conciseExplanation: "Penjelasan", latex: null, knowledgeKind: "definition", instructionalRole: "core" };
const body = {
  reviewerId: "admin",
  bundle: { ...scope, bundleId: "Besaran", status: "validated", currentReview: null },
  itemReviews: [{ reviewerId: "admin", imporBundleId: scope.id, targetId: "a", productId: null, status: "approved", notes: null }],
  preview: { ideas: [{ ...idea, learningSection: null, provenance: [
    { id: "prov", role: "primary", sourceTitle: "Sumber", excerpt: "x".repeat(33_000), sectionLocator: "Bab 1", pageNumber: 7, note: null },
  ] }], relations: [], learningSections: [] },
  draft: { ideas: [{ ...idea, lockedValue: "preserved" }], provenance: [{ id: "prov", span: "preserved" }], relations: [], learningSections: [] },
  reviewReset: { revision: scope.checksum, itemReviewCount: 1, bundleReviewCount: 0, fingerprint: "b".repeat(64) },
};
function snapshot(value: unknown = body) { return validateIdeaBundleSnapshot(value, scope, "admin"); }
const own = { reviewerId: "admin", notes: "Review selesai", status: "approved", revisionBound: true };

test("the live course route exposes only a valid bundle scope and reads authorized untruncated content", async () => {
  const page = { type: "page", rows: [], nextPage: false, ideaBundle: scope };
  expect(isLiveAdministrationRead(page)).toBe(true);
  expect(isLiveAdministrationRead({ ...page, ideaBundle: { ...scope, checksum: "old" } })).toBe(false);
  const transport: AcademicTransport = { locale: "id", accountId: "admin", origin: "https://example.test", async get(path) {
    expect(path).toBe("/api/admin/bundles/idea/import%2F1");
    return { status: 200, ok: true, json: async () => body };
  } };
  const data = await readIdeaBundle(transport, scope, new AbortController().signal);
  expect(data.preview.ideas[0]?.provenance[0]?.excerpt).toHaveLength(33_000);
});

test("rejects another course, import, actor or reset revision", () => {
  expect(() => snapshot({ ...body, bundle: { ...body.bundle, courseId: "other" } })).toThrow(expect.objectContaining({ status: 404 }));
  expect(() => snapshot({ ...body, bundle: { ...body.bundle, id: "other" } })).toThrow(expect.objectContaining({ status: 404 }));
  expect(() => snapshot({ ...body, reviewerId: "other" })).toThrow(expect.objectContaining({ status: 403 }));
  expect(() => snapshot({ ...body, bundle: { ...body.bundle, currentReview: { ...own, reviewerId: "other" } } })).toThrow(expect.objectContaining({ status: 403 }));
  expect(() => snapshot({ ...body, itemReviews: [{ ...body.itemReviews[0], reviewerId: "other" }] })).toThrow(expect.objectContaining({ status: 403 }));
  expect(() => snapshot({ ...body, reviewReset: { ...body.reviewReset, revision: "c".repeat(64) } })).toThrow(expect.objectContaining({ status: 409 }));
});

test("requires completed individual review for decisions and immutable revision approval for publication", () => {
  expect(ideaBundleControls(snapshot())).toMatchObject({ approve: true, reject: true, publish: false, discard: true });
  expect(ideaBundleControls(snapshot({ ...body, itemReviews: [] }))).toMatchObject({ approve: false, reject: false });
  expect(ideaBundleControls(snapshot({ ...body, itemReviews: [{ ...body.itemReviews[0], status: "changes_requested" }] })))
    .toMatchObject({ approve: false, reject: true });
  expect(ideaBundleControls(snapshot({ ...body, bundle: { ...body.bundle, currentReview: { ...own, revisionBound: false } } })))
    .toMatchObject({ approve: true, reject: false, publish: false });
  expect(ideaBundleControls(snapshot({ ...body, bundle: { ...body.bundle, currentReview: own } })))
    .toMatchObject({ approve: false, reject: false, publish: true });
  expect(ideaBundleControls(snapshot({ ...body, bundle: { ...body.bundle, status: "published", currentReview: own } })))
    .toMatchObject({ publish: false, withdraw: true, discard: false });
});

test("preserves other draft data and sends the exact reset evidence and withdrawal scope", () => {
  const data = snapshot();
  const updated = patchIdeaDraft(data.draft, idea.id, { ...idea, knowledgeKind: "definition", instructionalRole: "core", code: "JARAK" });
  expect(updated.ideas[0]).toMatchObject({ code: "JARAK", lockedValue: "preserved" });
  expect(updated.provenance).toEqual(data.draft.provenance);
  expect(ideaEditCommand(data, updated).body).toEqual({ draft: updated, expectedRevision: scope.checksum, reviewResetFingerprint: body.reviewReset.fingerprint });
  const withdraw = ideaLifecycleCommand(data, "withdraw");
  expect(withdraw).toMatchObject({ suffix: "/withdraw", method: "POST", body: { expectedRevision: scope.checksum, expectedCourseId: scope.courseId } });
  expect(isIdeaCommandReceipt(withdraw, scope, { result: { importId: "other", withdrawn: true } })).toBe(false);
  expect(isIdeaCommandReceipt(withdraw, scope, { result: { importId: scope.id, withdrawn: false } })).toBe(true);
});
