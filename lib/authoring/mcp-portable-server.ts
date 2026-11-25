import { McpServer, type RegisteredTool, type ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AnySchema, ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import type { Transport, TransportSendOptions } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  isJSONRPCErrorResponse,
  isJSONRPCRequest,
  isJSONRPCResultResponse,
  type JSONRPCMessage,
  type MessageExtraInfo,
  type RequestId,
  type ToolAnnotations,
} from "@modelcontextprotocol/sdk/types.js";
import { McpToolNameMap } from "./mcp-tool-names";

/** Translate call names only. SDK validation and all business payloads stay intact. */
export class PortableMcpTransport implements Transport {
  onclose?: Transport["onclose"];
  onerror?: Transport["onerror"];
  onmessage?: Transport["onmessage"];
  private readonly listRequests = new Set<RequestId>();
  private started = false;

  constructor(private readonly transport: Transport, private readonly names: McpToolNameMap) {}

  get sessionId(): string | undefined {
    return this.transport.sessionId;
  }

  setProtocolVersion(version: string): void {
    this.transport.setProtocolVersion?.(version);
  }

  async start(): Promise<void> {
    if (this.started) throw new Error("MCP_TRANSPORT_ALREADY_STARTED");
    this.started = true;
    const onmessage = this.transport.onmessage;
    const onerror = this.transport.onerror;
    const onclose = this.transport.onclose;
    this.transport.onmessage = (message, extra) => {
      onmessage?.(message, extra);
      this.receive(message, extra);
    };
    this.transport.onerror = (error) => {
      onerror?.(error);
      this.onerror?.(error);
    };
    this.transport.onclose = () => {
      this.listRequests.clear();
      onclose?.();
      this.onclose?.();
    };
    await this.transport.start();
  }

  private receive(message: JSONRPCMessage, extra?: MessageExtraInfo): void {
    let forwarded = message;
    if (isJSONRPCRequest(message)) {
      if (message.method === "tools/list") this.listRequests.add(message.id);
      if (message.method === "tools/call" && typeof message.params?.name === "string") {
        forwarded = { ...message, params: { ...message.params, name: this.names.canonicalName(message.params.name) } };
      }
    }
    this.onmessage?.(forwarded, extra);
  }

  async send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void> {
    let forwarded = message;
    if ((isJSONRPCResultResponse(message) || isJSONRPCErrorResponse(message)) && message.id !== undefined && this.listRequests.delete(message.id)) {
      if (isJSONRPCResultResponse(message) && Array.isArray(message.result.tools)) {
        const tools = message.result.tools.map((tool: unknown) => {
          if (!tool || typeof tool !== "object" || !("name" in tool) || typeof tool.name !== "string") {
            throw new Error("MCP_TOOL_LIST_INVALID");
          }
          return { ...tool, name: this.names.portableName(tool.name) };
        });
        forwarded = { ...message, result: { ...message.result, tools } };
      }
    }
    await this.transport.send(forwarded, options);
  }

  async close(): Promise<void> {
    this.listRequests.clear();
    await this.transport.close();
  }
}

/** Preserve canonical registrations while exposing one portable name per tool. */
export class PortableMcpServer extends McpServer {
  private readonly toolNames = new McpToolNameMap();

  override registerTool<OutputArgs extends ZodRawShapeCompat | AnySchema, InputArgs extends undefined | ZodRawShapeCompat | AnySchema = undefined>(
    name: string,
    config: {
      title?: string;
      description?: string;
      inputSchema?: InputArgs;
      outputSchema?: OutputArgs;
      annotations?: ToolAnnotations;
      _meta?: Record<string, unknown>;
    },
    callback: ToolCallback<InputArgs>,
  ): RegisteredTool {
    this.toolNames.assertAvailable(name);
    const tool = super.registerTool(name, config, callback);
    this.toolNames.register(name);
    return tool;
  }

  override connect(transport: Transport): Promise<void> {
    return super.connect(new PortableMcpTransport(transport, this.toolNames));
  }
}
