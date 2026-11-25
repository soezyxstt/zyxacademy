import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { adminMcpFailure } from "@/lib/admin-mcp/errors";
import { registeredOperation } from "@/lib/admin-mcp/operation-contracts";
import { ADMIN_MCP_SCOPES } from "@/lib/admin-mcp/registry";
import { resolveMcpAdmin, type McpPrincipal } from "@/lib/authoring/mcp-auth";
import { registerAuthoringMcpTools } from "@/lib/authoring/mcp-server";
import { MCP_AUTHORING_SCOPES } from "@/lib/authoring/mcp-workflows";
import { opsOperationPolicy } from "./operation-policy";

const controls = new Set(["expectedEnvironment", "expectedOrigin", "requestKey", "confirmationToken", "dryRun"]);
const excludedScopes = new Set(["users:pii:read", "users:roles:admin", "access:secrets:read", "forms:responses:export", "notifications:send"]);
const excludedOperations = new Set([
  "admin.capabilities", "forms.responses.list", "forms.responses.get", "forms.responses.export_sheet", "tokens.create",
]);

export type OpsBrowserIdentity = { actorId: string; sessionId: string };
export type OpsBrowserChat = OpsBrowserIdentity & { chatId: string; grantIds: string[] };

export type OpsRegisteredOperation = {
  description: string;
  input: z.ZodObject;
  policy: NonNullable<ReturnType<typeof opsOperationPolicy>>;
  protocol: "plan" | "direct";
  expectsTarget: boolean;
  invoke: (input: Record<string, unknown>) => Promise<CallToolResult>;
};

export function browserOperations(identity: OpsBrowserIdentity, beforeMutation?: McpPrincipal["beforeMutation"]) {
  const tools = new Map<string, OpsRegisteredOperation>();
  const registrar = {
    registerResource() { /* Embedded MCP resources have no browser chat operation. */ },
    registerTool(
      name: string,
      config: { description: string; inputSchema?: Record<string, z.ZodType>; annotations?: { readOnlyHint?: boolean } },
      invoke: (input: Record<string, unknown>) => Promise<CallToolResult>,
    ) {
      const descriptor = registeredOperation(server, name);
      if (excludedOperations.has(name) || descriptor?.requiredScopes.some(scope => excludedScopes.has(scope))) return;
      if (descriptor?.mode === "mutation" && descriptor.annotations.openWorldHint) return;
      if (descriptor?.mode === "read" && descriptor.risk === "sensitive") return;
      const policy = opsOperationPolicy(name)
        ?? (config.annotations?.readOnlyHint === true && descriptor?.mode !== "mutation" ? "read" : "once");
      const protocol = descriptor?.mode === "mutation" && descriptor.protocol === "admin-plan" ? "plan" : "direct";
      const originalShape = config.inputSchema ?? {};
      const expectsTarget = "expectedEnvironment" in originalShape && "expectedOrigin" in originalShape;
      const description = config.description.split(/ (?:Siapkan dengan dryRun|dryRun=true)/)[0];
      const shape = Object.fromEntries(Object.entries(originalShape).filter(([key]) =>
        !controls.has(key) && !(key === "includeEmail" && (name === "users.get" || name === "users.list"))
      ));
      tools.set(name, {
        description,
        input: z.strictObject(shape),
        policy,
        protocol,
        expectsTarget,
        invoke: async input => {
          try {
            await resolveMcpAdmin(principal);
            return await invoke(input);
          } catch (error) {
            return adminMcpFailure(error);
          }
        },
      });
    },
  };
  const server = registrar as unknown as McpServer;
  const principal: McpPrincipal = {
    actorId: identity.actorId,
    userId: identity.actorId,
    sessionId: identity.sessionId,
    authMethod: "session",
    beforeMutation,
    scopes: [...MCP_AUTHORING_SCOPES, ...ADMIN_MCP_SCOPES.filter(scope => !excludedScopes.has(scope))],
  };
  registerAuthoringMcpTools(server, principal);
  return tools;
}
