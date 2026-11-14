import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { zipSync } from "fflate";
import * as schema from "@/db/schema";

const fixtureRoot = join(process.cwd(), "tests/fixtures/bundles/idea-v2");
const paths = ["manifest.json", "sources/kinematika.md", "entities/source-materials.json", "entities/source-chunks.json", "entities/ideas.json", "entities/provenance.json", "entities/relations.json"];
const bytes = zipSync(Object.fromEntries(paths.map((path) => [path, new Uint8Array(readFileSync(join(fixtureRoot, path)))])), { level: 0 });
const manifest = JSON.parse(readFileSync(join(fixtureRoot, "manifest.json"), "utf8"));
const revision: string = manifest.bundleChecksum;
const state: any = {};

function records(table: unknown): any[] {
  if (table === schema.user) return state.role ? [{ role: state.role, identity: "admin" }] : [];
  if (table === schema.pengguna) return [{ id: "identity", status: "active" }];
  if (table === schema.penggunaPeran) return [{ code: "admin" }];
  if (table === schema.imporBundle) return [state.row];
  if (table === schema.reviewBundle) return state.review ? [state.review] : [];
  if (table === schema.reviewItemBundle) return state.items.map((item: any) => ({ ...item, ideaId: item.targetId }));
  if (table === schema.auditMutasi) return state.audits;
  if (table === schema.publikasiBundle) return state.publication ? [state.publication] : [];
  if (table === schema.courses) return [{ id: "legacy-physics" }];
  if (table === schema.mataKuliah) return [{ id: "course-physics", legacyCourseId: "legacy-physics" }];
  if (table === schema.bab) return [{ id: "chapter-kinematics", mataKuliahId: "course-physics" }];
  return [];
}

const fakeDb: any = {
  execute: async () => undefined,
  select: () => {
    let table: unknown;
    const query: any = {
      from(value: unknown) { table = value; return query; },
      innerJoin() { return query; }, where() { return query; }, limit() { return query; }, for() { return query; },
      then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) { return Promise.resolve(records(table)).then(resolve, reject); },
    };
    return query;
  },
  update: (table: unknown) => {
    let changes: any;
    let applied = false;
    const apply = () => {
      if (applied) return [];
      applied = true;
      if (table === schema.imporBundle) {
        if (state.failClaim && !changes.status) return [];
        Object.assign(state.row, changes);
      }
      return [{ id: "import" }];
    };
    const query: any = { set(value: unknown) { changes = value; return query; }, where() { return query; }, returning: async () => apply(), then(resolve: any, reject: any) { return Promise.resolve(apply()).then(resolve, reject); } };
    return query;
  },
  delete: (table: unknown) => ({ where: async () => { if (table === schema.reviewItemBundle) state.items = []; } }),
  insert: (table: unknown) => {
    let value: any;
    let applied = false;
    const apply = () => {
      if (applied) return;
      applied = true;
      if (table === schema.reviewBundle) state.review = value;
      if (table === schema.reviewItemBundle) state.items.push(value);
      if (table === schema.auditMutasi) state.audits.push(value);
      if (table === schema.publikasiBundle) state.publication = value;
    };
    const query: any = { values(input: unknown) { value = input; return query; }, onConflictDoNothing: () => query, onConflictDoUpdate: () => query, returning: async () => { apply(); return (Array.isArray(value) ? value : [value]).map((row: { id: string }) => ({ id: row.id })); }, then(resolve: any, reject: any) { apply(); return Promise.resolve().then(resolve, reject); } };
    return query;
  },
  transaction: async (callback: (tx: any) => unknown) => {
    if (state.driftBeforeTransaction) state.row.sourceUriOrKey = "replacement-key";
    return callback(fakeDb);
  },
};

const originalDb = { ...await import("@/db") };
const originalDispatch = { ...await import("@/lib/vector-sync-dispatch") };
const staging = { ...await import("@/lib/bundle/staging") };
mock.module("@/db", () => ({ db: fakeDb }));
mock.module("@/lib/bundle/staging", () => ({
  ...staging,
  getIdeaBundleImport: async () => ({ ...state.row, items: [], reviews: state.review ? [state.review] : [] }),
  downloadIdeaBundleArtifact: async () => bytes,
}));
mock.module("@/lib/vector-sync-dispatch", () => ({ dispatchVectorSync: () => undefined }));
const { getIdeaRevisionReviewContext, normalizeIdeaReviewItems, reviewIdeaBundleRevision, publishIdeaBundle } = await import("@/lib/bundle/publication");

afterAll(() => {
  mock.module("@/db", () => originalDb);
  mock.module("@/lib/bundle/staging", () => staging);
  mock.module("@/lib/vector-sync-dispatch", () => originalDispatch);
});

beforeEach(() => {
  state.role = "admin";
  state.failClaim = false;
  state.driftBeforeTransaction = false;
  state.row = { id: "import", bundleId: manifest.bundleId, checksum: revision, bundleType: "idea", courseId: "legacy-physics", sourceUriOrKey: "private-key", version: 2, status: "validated", requestedBy: "admin", validationReport: { valid: true } };
  state.review = null;
  state.items = [];
  state.audits = [];
  state.publication = null;
});

test("explicit item decisions cover the exact full set and cannot approve a failed or altered Idea", () => {
  const targets = [{ ideaId: "a", ideaHash: "a" }, { ideaId: "b", ideaHash: "b" }];
  const items = [{ ideaId: "a", ideaHash: "a", status: "approved" as const }, { ideaId: "b", ideaHash: "b", status: "approved" as const }];
  expect(normalizeIdeaReviewItems(targets, items, "approved")).toHaveLength(2);
  expect(() => normalizeIdeaReviewItems(targets, items.slice(0, 1), "approved")).toThrow("IDEA_BUNDLE_ITEM_REVIEW_INCOMPLETE");
  expect(() => normalizeIdeaReviewItems(targets, [items[0], items[0]], "approved")).toThrow("IDEA_BUNDLE_ITEM_REVIEW_MISMATCH");
  expect(() => normalizeIdeaReviewItems(targets, [items[0], { ...items[1], ideaHash: "stale" }], "approved")).toThrow("IDEA_BUNDLE_ITEM_REVIEW_MISMATCH");
  expect(() => normalizeIdeaReviewItems(targets, [items[0], { ...items[1], status: "changes_requested" }], "approved")).toThrow("IDEA_BUNDLE_ITEM_REVIEW_INCOMPLETE");
});

test("mocked service records the real item review and publishes once, with stale and role checks on retry", async () => {
  const context = await getIdeaRevisionReviewContext({ importId: "import", reviewerId: "admin", expectedRevision: revision });
  const items = context.ideas.map((idea) => ({ ideaId: idea.id, ideaHash: idea.ideaHash!, status: "approved" as const, notes: "Reviewed against source" }));
  const input = { importId: "import", reviewerId: "admin", expectedRevision: revision, decision: "approved" as const, items };
  expect(await reviewIdeaBundleRevision(input)).toMatchObject({ recorded: true, revision, status: "approved" });
  expect(state.items).toHaveLength(1);
  expect(state.items[0]).toMatchObject({ targetId: items[0].ideaId, status: "approved", notes: "Reviewed against source" });
  expect(state.audits[0].afterSnapshot).toMatchObject({ revision, items });
  expect(await reviewIdeaBundleRevision(input)).toMatchObject({ recorded: false });
  state.items[0].status = "changes_requested";
  await expect(publishIdeaBundle({ importId: "import", publishedBy: "admin", expectedRevision: revision })).rejects.toThrow("IDEA_BUNDLE_ITEM_REVIEW_INCOMPLETE");
  state.items[0].status = "approved";
  const evidence = state.audits;
  state.audits = [];
  await expect(publishIdeaBundle({ importId: "import", publishedBy: "admin", expectedRevision: revision })).rejects.toThrow("IDEA_BUNDLE_REVISION_REVIEW_REQUIRED");
  state.audits = evidence;
  expect(await publishIdeaBundle({ importId: "import", publishedBy: "admin", expectedRevision: revision })).toMatchObject({ published: true });
  expect(await publishIdeaBundle({ importId: "import", publishedBy: "admin", expectedRevision: revision })).toMatchObject({ published: false });
  const publicationHash = state.publication.publicationHash;
  state.publication.publicationHash = "changed";
  await expect(publishIdeaBundle({ importId: "import", publishedBy: "admin", expectedRevision: revision })).rejects.toThrow("IDEA_BUNDLE_PUBLICATION_CONFLICT");
  state.publication.publicationHash = publicationHash;
  await expect(publishIdeaBundle({ importId: "import", publishedBy: "admin", expectedRevision: "c".repeat(64) })).rejects.toThrow("IDEA_BUNDLE_STALE_CONTEXT");
  state.role = "student";
  await expect(publishIdeaBundle({ importId: "import", publishedBy: "admin", expectedRevision: revision })).rejects.toThrow("IDEA_BUNDLE_PUBLISH_FORBIDDEN");
});

test("publication rejects missing bundle approval and an artifact snapshot that changes before the transaction", async () => {
  state.row.status = "approved";
  await expect(publishIdeaBundle({ importId: "import", publishedBy: "admin", expectedRevision: revision })).rejects.toThrow("IDEA_BUNDLE_ADMIN_APPROVAL_REQUIRED");
  state.driftBeforeTransaction = true;
  await expect(publishIdeaBundle({ importId: "import", publishedBy: "admin", expectedRevision: revision })).rejects.toThrow("IDEA_BUNDLE_PUBLICATION_CONFLICT");
  expect(state.publication).toBeNull();
});

test("a legacy bundle-only decision requires explicit revision-bound item decisions before publication", async () => {
  state.row.status = "approved";
  state.review = { id: "legacy-review", imporBundleId: "import", reviewerId: "admin", status: "approved", notes: "Original decision" };
  await expect(publishIdeaBundle({ importId: "import", publishedBy: "admin", expectedRevision: revision })).rejects.toThrow("IDEA_BUNDLE_ITEM_REVIEW_INCOMPLETE");
  const context = await getIdeaRevisionReviewContext({ importId: "import", reviewerId: "admin", expectedRevision: revision });
  const items = context.ideas.map((idea) => ({ ideaId: idea.id, ideaHash: idea.ideaHash!, status: "approved" as const, notes: "Reviewed source" }));
  const input = { importId: "import", reviewerId: "admin", expectedRevision: revision, decision: "approved" as const, notes: "Original decision", items };
  expect(await reviewIdeaBundleRevision(input)).toMatchObject({ reviewId: "legacy-review", recorded: true });
  await expect(reviewIdeaBundleRevision({ ...input, items: [{ ...items[0], notes: "Changed after review" }] })).rejects.toThrow("IDEA_BUNDLE_REVIEW_IMMUTABLE");
  expect(await publishIdeaBundle({ importId: "import", publishedBy: "admin", expectedRevision: revision })).toMatchObject({ published: true });
});

test("failed snapshot claim prevents a stale review from being recorded", async () => {
  const context = await getIdeaRevisionReviewContext({ importId: "import", reviewerId: "admin", expectedRevision: revision });
  state.failClaim = true;
  const items = context.ideas.map((idea) => ({ ideaId: idea.id, ideaHash: idea.ideaHash!, status: "approved" as const }));
  await expect(reviewIdeaBundleRevision({ importId: "import", reviewerId: "admin", expectedRevision: revision, decision: "approved", items })).rejects.toThrow("IDEA_BUNDLE_PUBLICATION_CONFLICT");
  expect(state.review).toBeNull();
  expect(state.items).toHaveLength(0);
  expect(state.audits).toHaveLength(0);
});

test("publication requires the observed revision even when a caller omits it", async () => {
  state.row.status = "approved";
  await expect(publishIdeaBundle({ importId: "import", publishedBy: "admin" } as any)).rejects.toThrow("IDEA_BUNDLE_STALE_CONTEXT");
  expect(state.publication).toBeNull();
});
