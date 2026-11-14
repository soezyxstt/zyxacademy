import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { GET } from "@/app/api/authoring/contracts/product-v5/route";
import { productV5SchemaDocuments } from "@/lib/authoring/mcp-contract-revision";
import { productBundleV3Contract } from "@/lib/authoring/mcp-workflows";
import { normalizeSolutionReviewRequest, solutionReviewRequestSchema } from "@/lib/authoring/solution-review-request";
import { authoringJobSchema } from "@/lib/authoring/job-pack";

test("V5 advertises checksum-pinned structural schemas and scoped headless lifecycle", async () => {
  const contract = productBundleV3Contract().solutionCollection;
  expect(contract).toMatchObject({ schemaVersion: "product-bundle.v5", productType: "solution_collection", productSchemaVersion: "solution_collection.v1", collectionSchemaVersion: "solution_collection.v1", reviewTool: "authoring.review_solution_collection", publishTool: "authoring.publish_solution_collection", publicationPermitted: true });
  expect(contract.reviewContextRequiredInputs).toContain("expectedRevision");
  for (const document of productV5SchemaDocuments()) {
    const response = await GET(new Request(`https://example.test${document.path}`));
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(createHash("sha256").update(body).digest("hex")).toBe(document.sha256);
    expect(Buffer.byteLength(body)).toBe(document.bytes);
  }
  expect((await GET(new Request("https://example.test/api/authoring/contracts/product-v5?schema=product&sha256=old"))).status).toBe(409);
  expect((await GET(new Request("https://example.test/api/authoring/contracts/product-v5?schema=unknown"))).status).toBe(404);
});

test("headless review requires a reasoning decision and never approves a failed one", () => {
  const item = { itemId: "item", itemHash: "a".repeat(64), correctness: "approved", problemProvenance: "approved", solutionProvenance: "approved", release: "approved" };
  const input = { expectedRevision: "b".repeat(64), expectedReviewVersion: "c".repeat(64), decision: "approved", items: [item] };
  expect(solutionReviewRequestSchema.safeParse(input).success).toBe(false);
  const failed = solutionReviewRequestSchema.parse({ ...input, items: [{ ...item, reasoning: "changes_requested" }] });
  expect(() => normalizeSolutionReviewRequest(failed)).toThrow("PRODUCT_V5_REVIEW_INCOMPLETE");
  const accepted = solutionReviewRequestSchema.parse({ ...input, items: [{ ...item, reasoning: "approved" }] });
  const { expectedReviewVersion: _version, ...missingVersion } = accepted;
  expect(solutionReviewRequestSchema.safeParse(missingVersion).success).toBe(false);
  expect(normalizeSolutionReviewRequest(accepted)[0]).toMatchObject({ correctness: "approved", reasoning: "approved" });
});

test("V5 authoring jobs are standalone and do not require fabricated articles", () => {
  const job = { schemaVersion: "zyx-authoring-job.v1", jobId: "job", sourcePack: { packId: "pack", name: "pack", archiveSha256: "a".repeat(64), manifestPath: "source-pack/manifest.json" }, target: { courseId: "course", courseCode: "C", courseLabel: "Course" }, chapters: [{ id: "chapter", code: "C1", label: "Chapter", orderIndex: 0 }], sectionMappings: [{ sectionId: "section", documentId: "doc", sectionTitle: "Section", startUnit: 1, endUnit: 1, chapterId: "chapter", chapterLabel: "Chapter" }], requestedProducts: ["solution_collection"], attribution: { creatorId: "$UPLOADER", curatorId: "$APPROVING_REVIEWER" }, workflow: { ideaPublicationRequiredBeforeProducts: true, freshAuthoringContextRequired: true, ideaBundleSchemaVersion: "idea-bundle.v3", productBundleSchemaVersion: "product-bundle.v5" } };
  expect(authoringJobSchema.safeParse(job).success).toBe(true);
  expect(authoringJobSchema.safeParse({ ...job, requestedProducts: ["solution_collection", "article"] }).success).toBe(false);
  expect(authoringJobSchema.safeParse({ ...job, workflow: { ...job.workflow, productBundleSchemaVersion: "product-bundle.v4" } }).success).toBe(false);
});

test("normalization persists mixed correctness and reasoning decisions without collapsing them", () => {
  const input = solutionReviewRequestSchema.parse({ expectedRevision: "b".repeat(64), expectedReviewVersion: "c".repeat(64), decision: "rejected", items: [{ itemId: "item", itemHash: "a".repeat(64), correctness: "approved", reasoning: "changes_requested", problemProvenance: "approved", solutionProvenance: "approved", release: "approved", notes: "  Explain condition  " }] });
  expect(normalizeSolutionReviewRequest(input)[0]).toMatchObject({ correctness: "approved", reasoning: "changes_requested", notes: "Explain condition" });
});


test("the V5 headless procedure advertises every required semantic decision", () => {
  const procedure = readFileSync("docs/bundle/product-bundle-v5.md", "utf8").split("2. `reviewSolutionCollection")[1].split("3. `publishProductBundle")[0];
  for (const key of ["correctness", "reasoning", "problemProvenance", "solutionProvenance", "release"]) expect(procedure).toContain("`" + key + "`");
});
