import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { GET } from "@/app/api/authoring/contracts/idea-v3/route";
import { authoringValidationSnapshot, ideaV3SchemaDocuments } from "@/lib/authoring/mcp-contract-revision";
import { authoringContractSnapshot } from "@/lib/authoring/mcp-workflows";
import { loadPlaybookModule } from "@/lib/authoring/mcp-playbook";

test("Idea discovery exposes small pinned descriptors and all real validator schemas", async () => {
  const contract = authoringContractSnapshot().contracts.idea_product.outputs.ideaBundle!;
  const documents = ideaV3SchemaDocuments();
  expect(contract.initialDraft).toMatchObject({ tool: "authoring.create_idea_draft", scope: "authoring:stage", schemaDocument: "ideaDraftInput" });
  expect(contract.schemaDocuments).toHaveLength(8);
  expect(JSON.stringify(contract.schemaDocuments).length).toBeLessThan(4000);
  const snapshot = authoringValidationSnapshot();
  for (const descriptor of contract.schemaDocuments) {
    const response = await GET(new Request(`https://contract.test${descriptor.path}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/schema+json");
    const body = await response.text();
    expect(createHash("sha256").update(body).digest("hex")).toBe(descriptor.sha256);
    expect(Buffer.byteLength(body)).toBe(descriptor.bytes);
    expect(JSON.parse(body)).toEqual(snapshot.schemas[descriptor.name]);
    expect(documents.find(item => item.name === descriptor.name)?.body).toBe(body);
  }
  expect(JSON.stringify(snapshot.schemas.ideaDraftInput)).toContain('"sourceRefs"');
  expect(JSON.stringify(snapshot.schemas.ideaDraftInput)).toContain('"primaryIdeaKeys"');
  expect(contract.reviewRequired).toBe(true);
  expect(contract.publishTool).toBe("authoring.publish_idea_bundle");
  expect(loadPlaybookModule("idea/workflow").markdown).toContain("authoring.create_idea_draft");
  expect(loadPlaybookModule("pipeline/orchestration").markdown).toContain("authoring.create_idea_draft");
});

test("Idea schema retrieval rejects unknown names and stale schema pins", async () => {
  const index = await GET(new Request("https://contract.test/api/authoring/contracts/idea-v3"));
  expect((await index.json()).documents).toHaveLength(8);
  expect((await GET(new Request("https://contract.test/api/authoring/contracts/idea-v3?schema=../../.env"))).status).toBe(404);
  const stale = await GET(new Request("https://contract.test/api/authoring/contracts/idea-v3?schema=ideaDraftInput&sha256=old"));
  expect(stale.status).toBe(409);
  expect((await stale.json()).error).toBe("SCHEMA_REVISION_CHANGED");
});
