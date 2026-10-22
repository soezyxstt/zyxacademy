import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { GET } from "@/app/api/authoring/contracts/product-v4/route";
import { authoringValidationSnapshot, productV4SchemaDocuments } from "@/lib/authoring/mcp-contract-revision";
import { AUTHORING_CONTEXT_CONTRACT, EXTERNAL_AUTHORING_WORKFLOW } from "@/lib/authoring/policy";
import { productBundleV3Contract } from "@/lib/authoring/mcp-workflows";

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
