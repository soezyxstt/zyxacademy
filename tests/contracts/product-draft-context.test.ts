import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
import * as schema from "@/db/schema";
import { productDraftInputSchema, type ProductDraftInput } from "@/lib/authoring/product-draft-builder";
import type { ProductDraftCreationPorts, ProductDraftRun } from "@/lib/authoring/product-draft-service";
import { createPostgresTestDb } from "../helpers/postgres";

// Real PostgreSQL filters and constraints; no remote database or provider calls.
const { client, testDb } = await createPostgresTestDb();
const originalDb = { ...await import("@/lib/db") };
let selects = 0;
const trackedDb = new Proxy(testDb, { get(target, key) {
  if (key === "select") return (...args: unknown[]) => {
    selects++;
    return Reflect.apply(target.select, target, args);
  };
  const value = Reflect.get(target, key, target);
  return typeof value === "function" ? value.bind(target) : value;
} });
mock.module("@/lib/db", () => ({ ...originalDb, db: trackedDb }));
const { loadProductDraftContext } = await import("@/lib/authoring/product-draft-context");
afterAll(async () => { mock.module("@/lib/db", () => originalDb); await client.close(); });

const a = "a".repeat(64), b = "b".repeat(64);
const principal = { userId: "author", actorId: "author", sessionId: "session", authMethod: "session" as const, scopes: ["authoring:stage"] };
const run: ProductDraftRun = {
  kind: "run", runId: "mcp-run-context-fixture", workflow: "idea_product", courseId: "course", chapterId: "chapter",
  courseLabel: "Course", chapterLabel: "Chapter", issuedAt: Date.parse("2026-11-01T00:00:00Z"), expiresAt: Date.parse("2026-11-02T00:00:00Z"),
  sourcePackChecksum: null, sourcePackId: null, sourcePackName: null, sourcePackSummary: null,
};
type ArticleInput = Extract<ProductDraftInput["products"][number], { productType: "article" }>;
function article(): ArticleInput {
  return { productType: "article", title: "Pangkat", ideaIds: ["idea-main"], sourceRefs: [{ sourceId: "source-main", excerptIds: ["excerpt-main"] }],
    sections: [{ kind: "topic", title: "Aturan pangkat", learningObjective: "Memakai aturan pangkat", ideaIds: ["idea-main"],
      blocks: [{ blockType: "explanation", parts: [{ kind: "markdown", markdown: "Pangkat menyatakan hasil kali bilangan yang sama." }] }],
    }],
  };
}
function input(draft: ProductDraftInput = { products: [article()] }): Parameters<ProductDraftCreationPorts["loadContext"]>[0] {
  return { run, principal, draftKey: "draft-one", draft };
}

beforeAll(async () => {
  await testDb.insert(schema.user).values({ id: "author", name: "Author", email: "author@example.test", role: "admin" });
  await testDb.insert(schema.pengguna).values({ id: "author" });
  await testDb.insert(schema.mataKuliah).values([{ id: "course", code: "C", title: "Course" }, { id: "foreign-course", code: "F", title: "Foreign course" }]);
  await testDb.insert(schema.bab).values([
    { id: "chapter", mataKuliahId: "course", code: "C1", title: "Chapter", orderIndex: 0 },
    { id: "sibling-chapter", mataKuliahId: "course", code: "C2", title: "Sibling", orderIndex: 1 },
    { id: "foreign-chapter", mataKuliahId: "foreign-course", code: "F1", title: "Foreign", orderIndex: 0 },
  ]);
  const ideaRows: Array<Pick<typeof schema.ide.$inferInsert, "id" | "mataKuliahId" | "babId" | "status" | "version">> = [
    { id: "idea-main", mataKuliahId: "course", babId: "chapter", status: "published", version: 3 },
    { id: "idea-section", mataKuliahId: "course", babId: "sibling-chapter", status: "published", version: 4 },
    ...["idea-block", "idea-unit", "idea-unrequested"].map(id => ({ id, mataKuliahId: "course", babId: "chapter", status: "published" as const, version: 1 })),
    ...(["draft", "needs_review", "withdrawn", "superseded"] as const).map(status => ({ id: `idea-${status}`, mataKuliahId: "course", babId: "chapter", status, version: 1 })),
    { id: "idea-foreign", mataKuliahId: "foreign-course", babId: "foreign-chapter", status: "published", version: 1 },
  ];
  await testDb.insert(schema.ide).values(ideaRows.map(row => ({ ...row, stableKey: row.id, code: row.id, canonicalStatement: "Private statement", conciseExplanation: "Private explanation", semanticHash: a, generationHash: a, creatorId: "author" })));
  const sourceRows: Array<Pick<typeof schema.sumberMateri.$inferInsert, "id" | "mataKuliahId" | "babId" | "status" | "version">> = [
    { id: "source-main", mataKuliahId: "course", babId: "chapter", status: "active", version: 3 },
    { id: "source-global", mataKuliahId: "course", babId: null, status: "active", version: 2 },
    ...["source-block", "source-unrequested"].map(id => ({ id, mataKuliahId: "course", babId: "chapter", status: "active" as const, version: 1 })),
    { id: "source-sibling", mataKuliahId: "course", babId: "sibling-chapter", status: "active", version: 1 },
    { id: "source-foreign", mataKuliahId: "foreign-course", babId: "foreign-chapter", status: "active", version: 1 },
    ...(["draft", "withdrawn", "archived"] as const).map(status => ({ id: `source-${status}`, mataKuliahId: "course", babId: "chapter", status, version: 1 })),
  ];
  await testDb.insert(schema.sumberMateri).values(sourceRows.map(row => ({ ...row, title: row.id, canonicalUriOrR2Key: `${row.id}.md`, checksum: ` ${b.toUpperCase()} `, creatorId: "author" })));
  await testDb.insert(schema.potonganSumber).values([
    ...sourceRows.map(row => ({ id: row.id.replace("source-", "excerpt-"), sumberMateriId: row.id, sourceVersion: row.version!, content: "Private source content", startOffset: 0, endOffset: 20, checksum: b })),
    { id: "excerpt-stale", sumberMateriId: "source-main", sourceVersion: 2, content: "Old content", startOffset: 0, endOffset: 11, checksum: b },
    { id: "excerpt-main-unrequested", sumberMateriId: "source-main", sourceVersion: 3, content: "Unrequested", startOffset: 21, endOffset: 32, checksum: b },
  ]);
  const sections: Array<Pick<typeof schema.bagianPembelajaran.$inferInsert, "id" | "mataKuliahId" | "babId" | "status">> = [
    { id: "section-main", mataKuliahId: "course", babId: "chapter", status: "published" },
    { id: "section-unrequested", mataKuliahId: "course", babId: "chapter", status: "published" },
    { id: "section-sibling", mataKuliahId: "course", babId: "sibling-chapter", status: "published" },
    { id: "section-foreign", mataKuliahId: "foreign-course", babId: "foreign-chapter", status: "published" },
    ...(["withdrawn", "superseded"] as const).map(status => ({ id: `section-${status}`, mataKuliahId: "course", babId: "chapter", status })),
  ];
  await testDb.insert(schema.bagianPembelajaran).values(sections.map((row, orderIndex) => ({ ...row, stableKey: row.id, title: row.id, slug: row.id, orderIndex, learningObjective: "Private objective" })));
});

test("requested Ideas bind to the course and published state, including section, block and Diktat unit references", async () => {
  const product = article();
  product.ideaIds.push("idea-foreign", "idea-draft", "idea-needs_review", "idea-withdrawn", "idea-superseded", "idea-missing");
  product.sections[0].ideaIds = ["idea-section"];
  product.sections[0].blocks[0].ideaIds = ["idea-block"];
  const result = await loadProductDraftContext(input({ products: [product, { productType: "diktat", title: "Review", ideaIds: ["idea-main"], sourceRefs: product.sourceRefs,
    units: [{ ideaIds: ["idea-unit"], parts: [{ kind: "markdown", markdown: "Cek aturan pangkat." }] }],
  }] }));
  expect(result.ideas.toSorted((x, y) => x.id.localeCompare(y.id))).toEqual([
    { id: "idea-block", version: 1, semanticHash: a }, { id: "idea-main", version: 3, semanticHash: a },
    { id: "idea-section", version: 4, semanticHash: a }, { id: "idea-unit", version: 1, semanticHash: a },
  ]);
  expect(JSON.stringify(result)).not.toContain("Private statement");
});

test("source lookup admits active same-chapter or course-wide sources and exact current parent excerpts only", async () => {
  const product = article();
  product.sourceRefs[0].excerptIds.push("excerpt-stale", "excerpt-global", "excerpt-unrequested", "excerpt-missing");
  product.sourceRefs.push(...["sibling", "foreign", "draft", "withdrawn", "archived", "missing"].map(key => ({ sourceId: `source-${key}`, excerptIds: [`excerpt-${key}`] })));
  product.sections[0].sourceRefs = [{ sourceId: "source-global", excerptIds: ["excerpt-global"] }];
  product.sections[0].blocks[0].sourceRefs = [{ sourceId: "source-block", excerptIds: ["excerpt-block"] }];
  const result = await loadProductDraftContext(input({ products: [product] }));
  expect(result.sources.toSorted((x, y) => x.sourceId.localeCompare(y.sourceId))).toEqual([
    { sourceId: "source-block", version: 1, checksum: b, excerptIds: ["excerpt-block"] },
    { sourceId: "source-global", version: 2, checksum: b, excerptIds: ["excerpt-global"] },
    { sourceId: "source-main", version: 3, checksum: b, excerptIds: ["excerpt-main"] },
  ]);
  expect(JSON.stringify(result)).not.toContain("Private source content");
});

test("learning section lookup requires a requested published section in the exact course and chapter", async () => {
  const product = article();
  product.sections = ["main", "sibling", "foreign", "withdrawn", "superseded", "missing"].map(key => ({ ...product.sections[0], learningSectionId: `section-${key}` }));
  const result = await loadProductDraftContext(input({ products: [product] }));
  expect(result.learningSectionIds).toEqual(["section-main"]);
});

test("server metadata stays deterministic for actor, run and draft key and uses the bound timestamp and scope", async () => {
  const first = await loadProductDraftContext(input());
  const repeated = await loadProductDraftContext(input());
  const hash = createHash("sha256").update(`${run.runId}:${principal.actorId}:draft-one`).digest("hex").slice(0, 32);
  expect(first).toMatchObject({ bundleId: `mcp-product-${hash}`, courseId: "course", chapterId: "chapter", creatorId: "author", createdAt: "2026-11-01T00:00:00.000Z" });
  expect(repeated).toEqual(first);
  const contexts = [
    await loadProductDraftContext({ ...input(), draftKey: "draft-two" }),
    await loadProductDraftContext({ ...input(), run: { ...run, runId: "another-run" } }),
    await loadProductDraftContext({ ...input(), principal: { ...principal, actorId: "another-author" } }),
  ];
  expect(new Set([first, ...contexts].map(value => value.bundleId)).size).toBe(4);
  expect(contexts[2].creatorId).toBe("another-author");
});

test.each(["ideas", "sources", "excerpts", "sections"] as const)("aggregate %s reference limit rejects valid-shaped inputs before database I/O", async kind => {
  const product = article();
  let draft: ProductDraftInput = { products: [product] };
  if (kind === "ideas") product.ideaIds = Array.from({ length: 256 }, (_, index) => `idea-limit-${index}`);
  if (kind === "sources") product.sourceRefs = Array.from({ length: 256 }, (_, index) => ({ sourceId: `source-limit-${index}`, excerptIds: ["excerpt-main"] }));
  if (kind === "excerpts") {
    product.sourceRefs = Array.from({ length: 8 }, (_, source) => ({ sourceId: `source-limit-${source}`, excerptIds: Array.from({ length: 256 }, (_, index) => `excerpt-limit-${source}-${index}`) }));
  }
  if (kind === "sources" || kind === "excerpts") product.sections[0].sourceRefs = [{ sourceId: "source-main", excerptIds: ["excerpt-main"] }];
  if (kind === "sections") draft = { products: [100, 100, 57].map((length, group) => ({ ...article(),
    sections: Array.from({ length }, (_, index) => ({ ...article().sections[0], learningSectionId: `section-limit-${group}-${index}` })),
  })) };
  expect(productDraftInputSchema.safeParse(draft).success).toBe(true);
  selects = 0;
  await expect(loadProductDraftContext(input(draft))).rejects.toThrow("PRODUCT_DRAFT_REFERENCE_LIMIT");
  expect(selects).toBe(0);
});
