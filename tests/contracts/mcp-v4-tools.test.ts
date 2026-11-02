import { expect, test } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { productV4RequestErrorCode, registerProductV4Tools } from "@/lib/authoring/mcp-v4-tools";
import { issueMcpBootstrapToken, issueMcpRunToken } from "@/lib/authoring/mcp-workflows";

const principal = { actorId: "actor", sessionId: "session", userId: "actor", authMethod: "session" as const, scopes: ["authoring:read", "authoring:stage"] };
const runToken = () => issueMcpRunToken({ courseId: "canonical-course", chapterId: "chapter", workflow: "idea_product" });
const bootstrapToken = (actorId = "actor", stage: "source" | "product" = "source") => issueMcpBootstrapToken({ actorId, sessionId: "session", stage, clientCapabilities: { independentSubagents: true, localArtifactFiles: true, pdfRendering: true } });

async function connect(scopes = principal.scopes, overrides: Parameters<typeof registerProductV4Tools>[2] = {}) {
  const server = new McpServer({ name: "local-v4-contract", version: "1.0.0" });
  registerProductV4Tools(server, { ...principal, scopes }, overrides);
  const client = new Client({ name: "contract-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, close: async () => { await client.close(); await server.close(); } };
}

test("MCP catalog exposes six typed V4 tools with correct read/write hints", async () => {
  const connection = await connect();
  try {
    const tools = (await connection.client.listTools()).tools;
    expect(tools).toHaveLength(6);
    expect(tools.find(tool => tool.name === "source.extract_figure")!.annotations!.readOnlyHint).toBe(false);
    expect(tools.find(tool => tool.name === "authoring.get_verification")!.annotations!.readOnlyHint).toBe(true);
    expect(tools.find(tool => tool.name === "authoring.verify_product_bundle")!.inputSchema.required).toContain("expectedContentHash");
  } finally { await connection.close(); }
});

test("MCP mutations reject missing stage before source or storage I/O", async () => {
  let touched = false;
  const connection = await connect(["authoring:read"], { resolveFile: async () => { touched = true; throw new Error("NO_IO"); } });
  try {
    const response = await connection.client.callTool({ name: "source.extract_figure", arguments: { runToken: runToken(), bootstrapToken: bootstrapToken(), fileKey: "source", pageNumber: 1, crop: [0, 0, 1, 1], attribution: "Owner", permission: "unknown", sourceVisualId: "figure", sourcePackImportId: "pack", sourceDocumentId: "document", sourcePackChecksum: "a".repeat(64) } });
    expect(response.isError).toBe(true);
    expect(response.structuredContent).toEqual({ ok: false, error: "AUTHORING_MCP_SCOPE_REQUIRED" });
    expect(touched).toBe(false);
  } finally { await connection.close(); }
});

test("MCP requires fresh identity-bound bootstrap and rejects cross-course source", async () => {
  let touched = 0;
  // This partial foreign record exercises scope rejection before other fields are read.
  const connection = await connect(principal.scopes, { resolveFile: async () => { touched++; return { row: { courseId: "foreign" }, token: { courseId: "foreign", legacyCourseId: "foreign", chapterId: "chapter" } } as Awaited<ReturnType<NonNullable<NonNullable<Parameters<typeof registerProductV4Tools>[2]>["resolveFile"]>>>; } });
  try {
    const input = { runToken: runToken(), bootstrapToken: bootstrapToken("other-actor"), fileKey: "source", assetId: "a".repeat(64) };
    expect((await connection.client.callTool({ name: "source.get_figure", arguments: input })).isError).toBe(true);
    expect(touched).toBe(0);
    const denied = await connection.client.callTool({ name: "source.get_figure", arguments: { ...input, bootstrapToken: bootstrapToken() } });
    expect(denied.structuredContent).toEqual({ ok: false, error: "SOURCE_FIGURE_NOT_IN_SCOPE" });
    expect(touched).toBe(1);
    const missing = await connection.client.callTool({ name: "source.get_figure", arguments: { ...input, bootstrapToken: undefined } });
    expect(missing.isError).toBe(true);
  } finally { await connection.close(); }
});

test("MCP verification accepts canonical aliases and rejects stale content and foreign imports", async () => {
  let enqueues = 0;
  const contentHash = "a".repeat(64), planHash = "b".repeat(64);
  const connection = await connect(principal.scopes, {
    getImport: async (id: string) => ({ courseId: id === "foreign" ? "foreign-course" : "legacy-course" }) as never,
    courseAliases: async () => new Set(["canonical-course", "legacy-course"]),
    readiness: async () => ({ plan: { contentHash, planHash } }) as never,
    request: async input => { enqueues++; expect(input.expectedPlanHash).toBe(planHash); return { jobId: planHash } as never; },
    verification: async () => { throw new Error("INTERNAL_SECRET_DETAIL:must-not-leak"); },
  });
  try {
    const input = { runToken: runToken(), bootstrapToken: bootstrapToken("actor", "product"), importId: "allowed", expectedContentHash: contentHash };
    expect((await connection.client.callTool({ name: "authoring.verify_product_bundle", arguments: input })).isError).toBeUndefined();
    expect(enqueues).toBe(1);
    expect((await connection.client.callTool({ name: "authoring.verify_product_bundle", arguments: { ...input, expectedContentHash: "c".repeat(64) } })).structuredContent).toEqual({ ok: false, error: "PRODUCT_V4_VERIFICATION_CONFLICT" });
    expect((await connection.client.callTool({ name: "authoring.verify_product_bundle", arguments: { ...input, importId: "foreign" } })).isError).toBe(true);
    expect(enqueues).toBe(1);
    const response = await connection.client.callTool({ name: "authoring.get_verification", arguments: { runToken: input.runToken, bootstrapToken: input.bootstrapToken, importId: "allowed", planHash } });
    expect(response.structuredContent).toEqual({ ok: false, error: "AUTHORING_MCP_V4_REQUEST_FAILED" });
  } finally { await connection.close(); }
});



test("V4 diagnostics expose safe codes without runtime paths or identifiers", () => {
  expect(productV4RequestErrorCode(Object.assign(new Error("secret/path"), { code: "ENOENT" }))).toBe("PRODUCT_V4_RUNTIME_ASSET_UNAVAILABLE");
  expect(productV4RequestErrorCode(new Error("PRODUCT_V4_VERIFICATION_CONFLICT:private-id"))).toBe("PRODUCT_V4_VERIFICATION_CONFLICT");
  expect(productV4RequestErrorCode(new Error("private credentials"))).toBe("AUTHORING_MCP_V4_REQUEST_FAILED");
});
