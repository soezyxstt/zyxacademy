import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { GET } from "@/app/api/authoring/contracts/product-v4/route";
import { authoringValidationSnapshot, productV4SchemaDocuments } from "@/lib/authoring/mcp-contract-revision";
import { AUTHORING_CONTEXT_CONTRACT, EXTERNAL_AUTHORING_WORKFLOW } from "@/lib/authoring/policy";
import { authoringContractSnapshot, issueMcpRunToken, productBundleV3Contract, workflowContract } from "@/lib/authoring/mcp-workflows";
import { loadPlaybookModule } from "@/lib/authoring/mcp-playbook";
import { visualSpecSchema } from "@/lib/materials/visual-contract";

test("MCP links complete validator schemas with exact-byte integrity", async () => {
  const contract = productBundleV3Contract();
  const documents = productV4SchemaDocuments();
  expect(contract.schemaVersion).toBe("product-bundle.v4");
  expect(contract.articleSchemaVersion).toBe("article.v4");
  expect(contract.diktatSchemaVersion).toBe("diktat.v4");
  expect(contract.schemaDocuments).toHaveLength(9);
  expect(contract.typedVisuals.supportedKinds).toEqual(Object.keys(contract.capabilities));
  expect(contract.pilot.schemaDocuments).toEqual(contract.schemaDocuments);
  expect(contract.pilot.semanticRules).toEqual(contract.semanticRules);
  expect(contract.toolSequence).toContain("authoring.verify_product_bundle");
  expect(contract.toolSequence).toContain("authoring.get_verification");
  expect(AUTHORING_CONTEXT_CONTRACT.outputContracts.productBundle).toBe("product-bundle.v4");
  expect(EXTERNAL_AUTHORING_WORKFLOW.outputContracts.productBundle).toBe("product-bundle.v4");
  expect(AUTHORING_CONTEXT_CONTRACT.outputContracts.compatibleReadVersions).toContain("product-bundle.v3");
  expect(AUTHORING_CONTEXT_CONTRACT.outputContracts.compatibleReadVersions).toContain("product-bundle.v4");
  for (const descriptor of contract.pilot.schemaDocuments) {
    const response = await GET(new Request(`https://contract.test${descriptor.path}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/schema+json");
    const body = await response.text();
    expect(createHash("sha256").update(body).digest("hex")).toBe(descriptor.sha256);
    expect(Buffer.byteLength(body)).toBe(descriptor.bytes);
    expect(JSON.parse(body)).toEqual(authoringValidationSnapshot().schemas[descriptor.name]);
    expect(documents.find(item => item.name === descriptor.name)?.body).toBe(body);
  }
  const schemas = authoringValidationSnapshot().schemas;
  expect(JSON.stringify(schemas.articleParts)).toContain('"meaningMarkdown"');
  expect(JSON.stringify(schemas.articleParts)).toContain('"sourceElementRefs"');
  expect(JSON.stringify(schemas.product)).toContain('"sourceArticleHash"');
  expect(JSON.stringify(schemas.visual)).toContain('"controls"');
  expect(JSON.stringify(schemas.v4ReviewContext)).toContain('"semanticHash"');
  expect(contract.pilot.semanticRules.article).toContain("every section block");
  expect(JSON.stringify(contract.pilot.schemaDocuments).length).toBeLessThan(4000);
});

test("schema retrieval rejects unknown names and stale pins without returning other data", async () => {
  const index = await GET(new Request("https://contract.test/api/authoring/contracts/product-v4"));
  expect((await index.json()).documents).toHaveLength(9);
  const unknown = await GET(new Request("https://contract.test/api/authoring/contracts/product-v4?schema=../../.env.prod"));
  expect(unknown.status).toBe(404);
  expect(await unknown.json()).toEqual({ error: "SCHEMA_NOT_FOUND" });
  const stale = await GET(new Request("https://contract.test/api/authoring/contracts/product-v4?schema=product&sha256=old"));
  expect(stale.status).toBe(409);
  expect((await stale.json()).error).toBe("SCHEMA_REVISION_CHANGED");
});

test("product and quiz discover the same typed scene and isolated document contract", async () => {
  const snapshot = authoringContractSnapshot();
  const product = snapshot.contracts.idea_product.outputs.productBundle!;
  const quiz = snapshot.contracts.quiz_bank.outputs.quizDraft!;
  const guidance = product.typedVisuals.visualAuthoring;
  expect(quiz.visualAuthoring).toEqual(guidance);
  expect(product.typedVisuals.supportedKinds).toContain("interactive_scene");
  expect(product.typedVisuals.supportedKinds).toContain("interactive_document");
  expect(guidance.interactiveDocument.assessment).toContain("visualAssets");
  expect(guidance.interactiveDocument.product).toContain("manifest.visualAssets");
  expect(guidance.interactiveDocument.limits).toContain("have not been verified");
  expect(guidance.interactiveDocument.runtime).toContain("event.source === parent");
  expect(guidance.interactiveDocument.runtime).toContain("zyx:preferences");
  expect(guidance.interactiveDocument.presentation).toContain("question-option");
  const visualSchema = product.schemaDocuments.find(item => item.name === "visual");
  if (!visualSchema) throw new Error("VISUAL_SCHEMA_REQUIRED");
  expect(guidance.schemaDocument).toEqual(visualSchema);
  const response = await GET(new Request(`https://contract.test${guidance.schemaDocument.path}`));
  const body = await response.text();
  expect(createHash("sha256").update(body).digest("hex")).toBe(guidance.schemaDocument.sha256);
  expect(body).toContain("interactive_scene");
  expect(body).toContain("interactive_document");
  for (const example of Object.values(guidance.scene.examples)) {
    expect(visualSpecSchema.safeParse(example).success).toBe(true);
    expect(visualSpecSchema.safeParse({ ...example, html: "<script>alert(1)</script>" }).success).toBe(false);
  }
  expect(guidance.scene.assessment).toContain("solution-only");
  expect(guidance.scene.static).toContain("initial values");
  expect(guidance.scene.geometry).toContain("32 typed M, L, Q, C or Z");
  expect(guidance.scene.labels).toContain("marked inline math");
  expect(guidance.scene.limits).toContain("131072 UTF-8 bytes");
  expect(guidance.scene.limits).toContain("131072 UTF-16 code units");
  expect(product.publicationPermitted).toBe(true);
  expect(product.publicationScope).toContain("authoring:publish");
  expect(product.publicationScope).toContain("course/chapter run and exact checksum");
  expect(product.publicationScope).toContain("quality, review, PDF, trusted verification and traceability gate");
  expect(quiz.reviewRequired).toBe(true);
});

test("live workflow contract and playbooks expose scene guidance", () => {
  const previous = process.env.BETTER_AUTH_SECRET;
  process.env.BETTER_AUTH_SECRET = "test-secret-for-contract-discovery";
  try {
    const runToken = issueMcpRunToken({ workflow: "quiz_bank", courseId: "course", chapterId: "chapter" });
    const contract = workflowContract(runToken);
    expect(contract.outputs.quizDraft?.visualAuthoring.scene.kind).toBe("interactive_scene");
    expect(loadPlaybookModule("quiz/workflow").markdown).toContain("quizDraft.visualAuthoring");
    expect(loadPlaybookModule("product/editorial").markdown).toContain("interactive_scene");
  } finally {
    if (previous === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = previous;
  }
});
