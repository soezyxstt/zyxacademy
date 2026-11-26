import { beforeAll, describe, expect, test } from "bun:test";
import Ajv from "ajv";
import Ajv2020 from "ajv/dist/2020.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { createAuthoringMcpServer } from "@/lib/authoring/mcp-server";

const principal = { userId: "fixture", actorId: "fixture", sessionId: "fixture", authMethod: "oauth" as const, scopes: ["authoring:read", "authoring:stage"] };
const dialects = [
  { name: "Draft-07", meta: "http://json-schema.org/draft-07/schema#", validator: new Ajv({ allErrors: true, strict: false, strictNumbers: true }) },
  { name: "Draft 2020-12", meta: "https://json-schema.org/draft/2020-12/schema", validator: new Ajv2020({ allErrors: true, strict: false, strictNumbers: true }) },
];

async function rpc(method: string, params: Record<string, unknown>) {
  const server = createAuthoringMcpServer(principal);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(new Request("http://localhost/api/mcp/authoring", {
      method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }));
    expect(response.status).toBe(200);
    return await response.json();
  } finally { await server.close(); }
}

let tools: Tool[];
beforeAll(async () => {
  const listed = await rpc("tools/list", {});
  expect(listed.error).toBeUndefined();
  tools = listed.result.tools;
  expect(tools.length).toBeGreaterThan(190);
});

describe("public MCP JSON Schema compatibility", () => {
  test("validates every advertised input and output schema against both official meta-schemas", () => {
    const failures: Array<{ tool: string; schema: string; dialect: string; errors: unknown }> = [];
    for (const tool of tools) {
      for (const [key, schema] of [["inputSchema", tool.inputSchema], ["outputSchema", tool.outputSchema]] as const) {
        if (schema === undefined) continue;
        for (const { name, meta, validator } of dialects) {
          if (!validator.validate(meta, schema)) failures.push({ tool: tool.name, schema: key, dialect: name, errors: validator.errors });
        }
      }
    }
    expect(failures).toEqual([]);
  });

  test("the 2020-12 meta-schema rejects the legacy tuple syntax", () => {
    const legacyTuple = { type: "array", items: Array.from({ length: 4 }, () => ({ type: "number" })) };
    expect(dialects[0].validator.validate(dialects[0].meta, legacyTuple)).toBe(true);
    expect(dialects[1].validator.validate(dialects[1].meta, legacyTuple)).toBe(false);
  });

  test("the published figure crop accepts exactly four normalized numbers in both dialects", () => {
    const figure = tools.find(tool => tool.name === "source_extract_figure");
    expect(figure).toBeDefined();
    const crop = figure!.inputSchema.properties!.crop as Record<string, unknown>;
    expect(crop).toMatchObject({ type: "array", items: { type: "number", minimum: 0, maximum: 1 }, minItems: 4, maxItems: 4 });
    expect(Array.isArray(crop.items)).toBe(false);
    for (const { validator } of dialects) {
      const validate = validator.compile(crop);
      expect(validate([0, 0, 0.5, 1])).toBe(true);
      for (const invalid of [[], [0, 0, 1], [0, 0, 1, 1, 1], [0, 0, "1", 1], [-0.1, 0, 1, 1], [0, 0, 1.1, 1]]) {
        expect(validate(invalid)).toBe(false);
      }
    }
  });

  test("the SDK rejects malformed and reversed crops before the source handler", async () => {
    const input = {
      fileKey: "fixture", pageNumber: 1, attribution: "Fixture", permission: "owned", sourceVisualId: "figure",
      sourcePackChecksum: "a".repeat(64), sourcePackImportId: "pack", sourceDocumentId: "source",
      runToken: "invalid-run", bootstrapToken: "invalid-bootstrap",
    };
    for (const crop of [[0, 0, 1], [0, 0, 1, 1, 1], [0, 0, "1", 1], [-0.1, 0, 1, 1], [0, 0, 0, 1], [0, 1, 1, 0]]) {
      const response = await rpc("tools/call", { name: "source_extract_figure", arguments: { ...input, crop } });
      expect(response.result.isError).toBe(true);
      expect(response.result.structuredContent).toBeUndefined();
      expect(response.result.content[0].text).toContain("crop");
    }
    const validCrop = await rpc("tools/call", { name: "source_extract_figure", arguments: { ...input, crop: [0, 0, 0.5, 1] } });
    expect(validCrop.result.structuredContent.error).toBe("AUTHORING_MCP_TOKEN_INVALID");
  });
});
