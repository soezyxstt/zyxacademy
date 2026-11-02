import { assertMcpTarget } from "@/lib/authoring/mcp-environment";
import { redactActivationTokens } from "./sensitive-data";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { requireMcpScope, resolveMcpAdmin, type McpPrincipal } from "@/lib/authoring/mcp-auth";
import { AdminMcpError, auditedMutation, mutationPlan, verifyMutationPlan, type AdminTransaction } from "./mutations";
export const adminId = z.string().trim().min(1).max(200);
export const adminRevision = z.string().regex(/^[a-f0-9]{64}$/);
export const adminPagination = { limit: z.number().int().min(1).max(100).default(25), offset: z.number().int().min(0).max(100000).default(0) };
type Registrar = { registerTool(name: string, config: { description: string; inputSchema: Record<string, z.ZodType>; annotations: { readOnlyHint: boolean; destructiveHint: boolean; openWorldHint: boolean } }, callback: (input: Record<string, unknown>) => Promise<CallToolResult>): unknown };
/** Explicit named tools only. Writes produce a signed plan and an atomic audit/idempotency receipt. */
export function adminToolkit(server: McpServer, principal: McpPrincipal) {
  function read<T extends z.ZodObject>(name: string, scope: string, schema: T, description: string, execute: (input: z.infer<T>) => Promise<unknown>, writes = false) {
    (server as unknown as Registrar).registerTool(name, { description, inputSchema: schema.extend({ expectedEnvironment: z.enum(["staging", "production", "local"]), expectedOrigin: z.url().max(2048) }).shape, annotations: { readOnlyHint: !writes, destructiveHint: writes, openWorldHint: false } }, async raw => {
      try {
        requireMcpScope(principal, scope);
        const { expectedEnvironment, expectedOrigin, ...businessInput } = schema.extend({ expectedEnvironment: z.enum(["staging", "production", "local"]), expectedOrigin: z.url().max(2048) }).strict().parse(raw);
        try { assertMcpTarget(expectedEnvironment, expectedOrigin); } catch { throw new AdminMcpError("MCP_TARGET_ENVIRONMENT_MISMATCH"); }
        const input = businessInput as z.infer<T>;
        if (Buffer.byteLength(JSON.stringify(input)) > 1000000) throw new AdminMcpError("INPUT_TOO_LARGE");
        await resolveMcpAdmin(principal);
        const result = await execute(input);
        const data = name.startsWith("groups.") && !principal.scopes.includes("access:secrets:read") ? redactActivationTokens(result) : result;
        if (Buffer.byteLength(JSON.stringify(data) ?? "") > 1000000) throw new AdminMcpError("REDUCE_PAGE_SIZE");
        const payload = { ok: true, data };
        return { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload };
      } catch (error) {
        const code = error instanceof AdminMcpError ? error.code : error instanceof z.ZodError ? "INVALID_INPUT" : error instanceof Error && error.message.startsWith("AUTHORING_MCP_SCOPE_REQUIRED:") ? "AUTHORING_MCP_SCOPE_REQUIRED" : "ADMIN_MCP_REQUEST_FAILED";
        const payload = { ok: false, error: code, recovery: code === "REVISION_CONFLICT" ? "Ambil versi terbaru dan siapkan ulang perubahan." : "Periksa akses, masukan, dan status target sebelum mencoba lagi." };
        return { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload, isError: true };
      }
    });
  }
  function write<T extends z.ZodObject>(name: string, scope: string, schema: T, description: string, execute: (tx: AdminTransaction, input: z.infer<T>) => Promise<Record<string, unknown>>, inspect?: (input: z.infer<T>) => Promise<unknown>) {
    const controls = schema.extend({ requestKey: z.string().min(8).max(100), dryRun: z.boolean().default(true), confirmationToken: z.string().max(4096).optional() });
    read(name, scope, controls, description + " Siapkan dengan dryRun=true, lalu jalankan input yang sama dengan dryRun=false dan confirmationToken. requestKey harus tetap sama untuk retry.", async raw => {
      const { requestKey: rawKey, confirmationToken: rawToken, dryRun, ...target } = raw;
      const requestKey = z.string().parse(rawKey);
      const input = target as z.infer<T>;
      if (dryRun) return mutationPlan(principal, name, { input, requestKey }, inspect ? await inspect(input) : { operation: name, target: input });
      if (typeof rawToken !== "string") throw new AdminMcpError("CONFIRMATION_REQUIRED");
      verifyMutationPlan(principal, name, { input, requestKey }, rawToken);
      return auditedMutation(principal, name, requestKey, input, tx => execute(tx, input));
    }, true);
  }
  return { read, write };
}
