import { describe, expect, test } from "bun:test";
import { McpServer, type RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { Transport, TransportSendOptions } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { CallToolResult, JSONRPCMessage, MessageExtraInfo, ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { PortableMcpServer, PortableMcpTransport } from "@/lib/authoring/mcp-portable-server";
import { MCP_SERVER_IDS, McpToolNameMap, portableMcpToolName } from "@/lib/authoring/mcp-tool-names";

class RecordingTransport implements Transport {
  onclose?: Transport["onclose"];
  onerror?: Transport["onerror"];
  onmessage?: Transport["onmessage"];
  sessionId = "fixture-session";
  protocolVersion?: string;
  starts = 0;
  closes = 0;
  sent: Array<{ message: JSONRPCMessage; options?: TransportSendOptions }> = [];
  async start() { this.starts++; }
  async send(message: JSONRPCMessage, options?: TransportSendOptions) { this.sent.push({ message, options }); }
  async close() { this.closes++; this.onclose?.(); }
  setProtocolVersion(version: string) { this.protocolVersion = version; }
}

describe("portable MCP names", () => {
  test("uses short environment IDs and stable readable names within the host budget", () => {
    expect(MCP_SERVER_IDS).toEqual({ staging: "zyx-stg", production: "zyx-prd", local: "zyx-local" });
    expect(portableMcpToolName("forms.responses.sheet_state")).toBe("forms_responses_sheet_state");
    expect(portableMcpToolName("authoring.get_solution_collection_review_context")).toBe("authoring_solution_review_context");
    const longestAllowed = "a".repeat(40);
    expect(portableMcpToolName(longestAllowed)).toBe(longestAllowed);
    for (const id of Object.values(MCP_SERVER_IDS)) {
      expect(`mcp_${id}_${id}_${longestAllowed}`).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
    }
    for (const invalid of ["a".repeat(41), "tool/read", "tool name", ""]) {
      expect(() => portableMcpToolName(invalid)).toThrow("MCP_TOOL_NAME_INVALID");
    }
  });

  test("rejects ambiguous names and never guesses a reverse underscore mapping", () => {
    const names = new McpToolNameMap();
    names.register("forms.responses_get");
    expect(names.canonicalName("forms_responses_get")).toBe("forms.responses_get");
    expect(names.canonicalName("forms.responses_get")).toBe("forms.responses_get");
    expect(names.canonicalName("unknown_name")).toBe("unknown_name");
    expect(() => names.register("forms.responses.get")).toThrow("MCP_TOOL_NAME_COLLISION");
    expect(() => names.register("forms_responses_get")).toThrow("MCP_TOOL_NAME_COLLISION");
    expect(() => names.register("forms.responses_get")).toThrow("MCP_TOOL_NAME_DUPLICATE");
    expect(() => names.portableName("unknown.name")).toThrow("MCP_TOOL_NAME_UNREGISTERED");
    const reversed = new McpToolNameMap();
    reversed.register("forms_responses_get");
    expect(() => reversed.register("forms.responses.get")).toThrow("MCP_TOOL_NAME_COLLISION");
  });

  test("registration rejects collisions before a conflicting tool enters the SDK catalog", () => {
    const server = new PortableMcpServer({ name: "fixture", version: "1" });
    const handler = async () => ({ content: [] });
    server.registerTool("a.b_c", {}, handler);
    expect(() => server.registerTool("a_b.c", {}, handler)).toThrow("MCP_TOOL_NAME_COLLISION");
    expect(() => server.registerTool("x".repeat(41), {}, handler)).toThrow("MCP_TOOL_NAME_INVALID");
  });
});

describe("portable transport boundary", () => {
  test("preserves request extras, payloads, lifecycle, session and protocol callbacks", async () => {
    const names = new McpToolNameMap();
    names.register("admin.operation_receipt");
    const native = new RecordingTransport();
    const events: string[] = [];
    native.onmessage = () => { events.push("native-message"); };
    native.onerror = () => { events.push("native-error"); };
    native.onclose = () => { events.push("native-close"); };
    const adapter = new PortableMcpTransport(native, names);
    const received: Array<{ message: JSONRPCMessage; extra?: MessageExtraInfo }> = [];
    adapter.onmessage = (message, extra) => { received.push({ message, extra }); };
    const failure = new Error("fixture-error");
    adapter.onerror = (error) => { expect(error).toBe(failure); events.push("adapter-error"); };
    adapter.onclose = () => { events.push("adapter-close"); };
    await adapter.start();
    expect(native.starts).toBe(1);
    const extra: MessageExtraInfo = {
      requestInfo: { headers: { "x-fixture": "unchanged" }, url: new URL("http://localhost/mcp") },
      authInfo: { token: "fixture", clientId: "fixture", scopes: ["fixture:read"] },
      closeSSEStream: () => undefined,
      closeStandaloneSSEStream: () => undefined,
    };
    const request: JSONRPCMessage = {
      jsonrpc: "2.0", id: "receipt", method: "tools/call",
      params: { name: "admin_operation_receipt", arguments: { operation: "blog.create", requestKey: "same-request", text: "admin.operation_receipt" }, _meta: { progressToken: "receipt-progress" } },
    };
    native.onmessage?.(request, extra);
    expect(received[0].message).toEqual({ ...request, params: { ...request.params, name: "admin.operation_receipt" } });
    expect(request.params?.name).toBe("admin_operation_receipt");
    expect(received[0].extra).toBe(extra);
    const notification: JSONRPCMessage = { jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: "receipt" } };
    native.onmessage?.(notification, extra);
    expect(received[1].message).toBe(notification);
    native.sessionId = "renewed-session";
    expect(adapter.sessionId).toBe("renewed-session");
    adapter.setProtocolVersion("2025-11-25");
    expect(native.protocolVersion).toBe("2025-11-25");
    native.onerror?.(failure);
    await adapter.close();
    expect(native.closes).toBe(1);
    expect(events).toEqual(["native-message", "native-message", "native-error", "adapter-error", "native-close", "adapter-close"]);
  });

  test("changes only correlated list names, preserving IDs, options, schema and all metadata", async () => {
    const names = new McpToolNameMap();
    names.register("forms.preview");
    const native = new RecordingTransport();
    const adapter = new PortableMcpTransport(native, names);
    await adapter.start();
    native.onmessage?.({ jsonrpc: "2.0", id: 7, method: "tools/list", params: { cursor: "page" } });
    const definition = {
      name: "forms.preview", description: "forms.preview stays in authored text",
      inputSchema: { type: "object", properties: { operation: { const: "forms.preview" } } },
      outputSchema: { type: "object", properties: { tools: { type: "array" } } },
      annotations: { readOnlyHint: true }, execution: { taskSupport: "optional" },
      _meta: { ui: { resourceUri: "ui://forms/preview" }, other: { name: "forms.preview" } },
    };
    const unrelated: JSONRPCMessage = { jsonrpc: "2.0", id: "7", result: { tools: [definition] } };
    await adapter.send(unrelated);
    expect(native.sent[0].message).toBe(unrelated);
    const response: JSONRPCMessage = { jsonrpc: "2.0", id: 7, result: { tools: [definition], nextCursor: "next", _meta: { fixture: true } } };
    const options: TransportSendOptions = { relatedRequestId: 7, resumptionToken: "resume", onresumptiontoken: () => undefined };
    await adapter.send(response, options);
    expect(native.sent[1]).toEqual({ message: { ...response, result: { ...response.result, tools: [{ ...definition, name: "forms_preview" }] } }, options });
    expect(native.sent[1].options).toBe(options);
    expect(definition.name).toBe("forms.preview");
    await adapter.send(response);
    expect(native.sent[2].message).toBe(response);
    native.onmessage?.({ jsonrpc: "2.0", id: "failed", method: "tools/list" });
    const error: JSONRPCMessage = { jsonrpc: "2.0", id: "failed", error: { code: -32603, message: "fixture" } };
    await adapter.send(error);
    expect(native.sent[3].message).toBe(error);
    const afterError: JSONRPCMessage = { ...response, id: "failed" };
    await adapter.send(afterError);
    expect(native.sent[4].message).toBe(afterError);
    native.onmessage?.({ jsonrpc: "2.0", id: "closed", method: "tools/list" });
    await adapter.close();
    const afterClose: JSONRPCMessage = { ...response, id: "closed" };
    await adapter.send(afterClose);
    expect(native.sent[5].message).toBe(afterClose);
  });
});

// Match the application's public registrar boundary across SDK/app Zod versions.
type FixtureRegistrar = {
  registerTool(name: string, config: Record<string, unknown>, handler: (
    input: { text: string; operation: string },
    extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
  ) => Promise<CallToolResult>): RegisteredTool;
};

async function fixtureRpc(method: string, params: Record<string, unknown>, options: { portable?: boolean; invalidOutput?: boolean; disabled?: boolean } = {}) {
  const server: McpServer = options.portable === false
    ? new McpServer({ name: "fixture", version: "1" })
    : new PortableMcpServer({ name: "fixture", version: "1" });
  let invocations = 0;
  const registered = (server as unknown as FixtureRegistrar).registerTool("fixture.echo", {
    title: "Fixture echo", description: "Keep operation fixture.echo unchanged",
    inputSchema: { text: z.string(), operation: z.literal("fixture.echo") },
    outputSchema: { text: z.string(), operation: z.literal("fixture.echo") },
    annotations: { readOnlyHint: true, destructiveHint: false },
    _meta: { ui: { resourceUri: "ui://fixture/echo" } },
  }, async ({ text, operation }, extra) => {
    invocations++;
    expect(extra.requestInfo?.headers["x-fixture"]).toBe("http-extra");
    return { content: [{ type: "text", text }], structuredContent: { text: options.invalidOutput ? 42 : text, operation } };
  });
  if (options.disabled) registered.disable();
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(new Request("http://localhost/api/mcp/authoring", {
      method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "x-fixture": "http-extra" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "fixture-request", method, params }),
    }));
    expect(response.status).toBe(200);
    return { body: await response.json(), invocations };
  } finally { await server.close(); }
}

describe("SDK HTTP compatibility", () => {
  test("publishes one portable definition with the exact SDK schemas and metadata", async () => {
    const canonical = await fixtureRpc("tools/list", {}, { portable: false });
    const portable = await fixtureRpc("tools/list", {});
    expect(portable.body).toEqual({ ...canonical.body, result: { ...canonical.body.result, tools: [{ ...canonical.body.result.tools[0], name: "fixture_echo" }] } });
  });

  test("accepts portable and legacy calls on separate fresh servers before tools/list", async () => {
    for (const name of ["fixture_echo", "fixture.echo"]) {
      const { body, invocations } = await fixtureRpc("tools/call", { name, arguments: { text: "authored fixture.echo text", operation: "fixture.echo" } });
      expect(body.id).toBe("fixture-request");
      expect(body.result.isError).not.toBe(true);
      expect(body.result.structuredContent).toEqual({ text: "authored fixture.echo text", operation: "fixture.echo" });
      expect(invocations).toBe(1);
    }
  });

  test("keeps SDK input, output, disabled-tool and unknown-tool checks", async () => {
    const invalidInput = await fixtureRpc("tools/call", { name: "fixture_echo", arguments: { text: 42, operation: "fixture.echo" } });
    expect(invalidInput.body.result.isError).toBe(true);
    expect(invalidInput.invocations).toBe(0);
    const valid = { name: "fixture_echo", arguments: { text: "ok", operation: "fixture.echo" } };
    const invalidOutput = await fixtureRpc("tools/call", valid, { invalidOutput: true });
    expect(invalidOutput.body.result.isError).toBe(true);
    expect(invalidOutput.invocations).toBe(1);
    const disabled = await fixtureRpc("tools/call", valid, { disabled: true });
    expect(disabled.body.result.isError).toBe(true);
    expect(disabled.invocations).toBe(0);
    const unknown = await fixtureRpc("tools/call", { ...valid, name: "fixture_unknown" });
    expect(unknown.body.result.isError).toBe(true);
    expect(unknown.invocations).toBe(0);
  });
});
